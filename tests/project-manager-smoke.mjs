import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const store = new Map();
const context = {
  self: {
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
    }
  }
};

vm.createContext(context);
vm.runInContext(
  fs.readFileSync(new URL("../src/investigation/project-manager.js", import.meta.url), "utf8"),
  context
);

const api = context.self.SignalDockProjectManager;
assert.equal(api.VERSION, 4);
const source = fs.readFileSync(new URL("../src/investigation/project-manager.js", import.meta.url), "utf8");
assert.ok(source.includes("function prependUniqueById("), "Project Manager must centralize repeated prepend/dedupe history logic");
assert.equal((source.match(/\.filter\(\(candidate\) => candidate\.id !==/g) || []).length, 1, "Project Manager should keep one shared history dedupe filter");


const created = api.create([], { name: "Payments", tags: ["prod"] });
const manyTags = [...Array.from({ length: 5000 }, () => "dup"), ...Array.from({ length: 25 }, (_, index) => `tag-${index}`)];
const taggedProject = api.create([], { name: "Tagged", tags: manyTags }).project;
assert.equal(taggedProject.tags.length, 20, "project tag cap mismatch");
assert.equal(taggedProject.tags[0], "dup");
assert.equal(taggedProject.tags[19], "tag-18", "bounded project tag normalization changed ordering");
let projects = api.touchDataset(created.projects, created.project.id, {
  id: "d1",
  name: "prod.ndjson",
  size: 456,
  handleRef: "p:file:d1",
  handleKind: "file"
});
projects = api.touchWorkspace(projects, created.project.id, {
  id: "w1",
  name: "incident.sdsession",
  size: 123,
  handleRef: "p:file:w1",
  handleKind: "file"
});

assert.equal(projects[0].recentDatasets[0].reopenable, true);
projects = api.touchDataset(projects, created.project.id, { id: "d2", name: "next.ndjson", size: 789 });
assert.deepEqual(Array.from(projects[0].recentDatasets, (item) => item.id), ["d2", "d1"], "new dataset history item must be prepended");
projects = api.touchDataset(projects, created.project.id, { id: "d1", name: "prod-new.ndjson", size: 999 });
assert.deepEqual(Array.from(projects[0].recentDatasets, (item) => item.id), ["d1", "d2"], "duplicate dataset history id must move to the front without duplication");
assert.equal(projects[0].recentDatasets.filter((item) => item.id === "d1").length, 1);
projects = api.markHistoryReopened(projects, created.project.id, "recentDatasets", "d1");
assert.equal(projects[0].recentDatasets[0].reopenCount, 1);
assert.ok(projects[0].recentDatasets[0].lastReopenedAt);

projects = api.attachBaseline(projects, created.project.id, { id: "b1", name: "Before" });
projects = api.attachBaseline(projects, created.project.id, { id: "b1", name: "After" });
assert.equal(projects[0].baselines.length, 1, "baseline replacement must not duplicate ids");
assert.equal(projects[0].baselines[0].name, "After");
projects = api.attachCase(projects, created.project.id, { id: "c1", title: "Case one", status: "open" });
projects = api.attachCase(projects, created.project.id, { id: "c1", title: "Case updated", status: "resolved" });
assert.equal(projects[0].cases.length, 1, "case replacement must not duplicate ids");
assert.equal(projects[0].cases[0].title, "Case updated");

projects = api.unlinkHistoryHandle(projects, created.project.id, "recentDatasets", "d1");
assert.equal(projects[0].recentDatasets[0].reopenable, false);
projects = api.linkHistoryHandle(projects, created.project.id, "recentDatasets", "d1", "p:file:d1");

const portable = api.portableProject(projects[0]);
for (const item of [...portable.recentDatasets, ...portable.recentWorkspaces]) {
  assert.equal("handleRef" in item, false, "portable project must not expose local handle references");
  assert.equal("handleKind" in item, false, "portable project must not expose local handle kinds");
  assert.equal("reopenable" in item, false, "portable project must not expose reopen capability state");
  assert.equal("linkedAt" in item, false, "portable project must not expose local link metadata");
}

const duplicated = api.duplicate(projects, created.project.id, "Payments copy");
const duplicate = duplicated.projects.find((project) => project.id === duplicated.project.id);
assert.equal(duplicate.recentDatasets[0].handleRef, "", "duplicate must not inherit dataset capabilities");
assert.equal(duplicate.recentWorkspaces[0].handleRef, "", "duplicate must not inherit workspace capabilities");

const exported = api.exportJson(projects, created.project.id);
assert.equal(exported.includes("p:file:d1"), false, "portable export must strip dataset handle references");
assert.equal(exported.includes("p:file:w1"), false, "portable export must strip workspace handle references");

const imported = api.importJson(exported);
assert.equal(imported.activeId, created.project.id);
assert.throws(() => api.importJson(JSON.stringify({ schema: "signaldock.projects", version: "4", projects: [] })), /Unsupported|invalid/, "string project version must be rejected");
assert.equal(imported.projects[0].recentDatasets[0].handleRef, "");
assert.equal(imported.projects[0].recentWorkspaces[0].handleRef, "");

const legacy = JSON.stringify({
  schema: "signaldock.projects",
  version: 3,
  activeId: "old",
  projects: [{
    id: "old",
    name: "Legacy",
    recentDatasets: [{ id: "x", name: "x.log", handleRef: "legacy:file:x" }]
  }]
});
const migrated = api.importJson(legacy);
assert.equal(migrated.projects[0].recentDatasets[0].handleRef, "", "legacy import must strip local capability references");

const oversizedProjects = Array.from({ length: 5000 }, (_, index) => ({ id: `bulk-${index}`, name: `Bulk ${index}` }));
const boundedImport = api.importJson(JSON.stringify({ schema: "signaldock.projects", version: 4, projects: oversizedProjects }));
assert.equal(boundedImport.projects.length, api.MAX, "project import must normalize only the bounded project window");

console.log("project-manager-smoke PASS");
