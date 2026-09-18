import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(n)=>fs.readFileSync(path.join(root,n),"utf8");
const html=read("index.html"), app=read("app.js"), source=read("src/app/query-navigation-controller.js");

assert.ok(html.includes("src/app/query-navigation-controller.js"));
assert.ok(html.indexOf("src/app/query-navigation-controller.js") < html.indexOf("app.js"));
assert.ok(app.includes("SignalDockQueryNavigationController.create"));
for(const token of ["const patterns =", "function applyTopologyFilter({", "return /\s/.test(text)"]) assert.ok(!app.includes(token),"root still owns query navigation: "+token);
for(const forbidden of ["SignalDockQueryEngine","SignalDockStorageAdapter","SignalDockPersistence","new Worker",".postMessage(","indexedDB","localStorage","showOpenFilePicker","XMLHttpRequest","WebSocket","EventSource",".invoke("]) assert.ok(!source.includes(forbidden),forbidden);
assert.ok(!/\bfetch\s*\(/.test(source));

const el={queryInput:{value:'level:ERROR service:old "needle text"'}};
const calls=[]; const notices=[];
const host={};
vm.runInNewContext(source,{self:host,window:host,console,Object,String,RegExp},{filename:"query-navigation-controller.js"});
const c=host.SignalDockQueryNavigationController.create({el,applyFilters:(reset)=>calls.push(reset),toast:(m)=>notices.push(m)});

assert.equal(c.filterByServiceValue("api gateway"),true);
assert.equal(el.queryInput.value,'level:ERROR "needle text" service:"api gateway"');
assert.equal(calls.at(-1),true);

el.queryInput.value="env:prod ns:old service:api status";
assert.equal(c.filterByDimension("namespace","payments core"),true);
assert.equal(el.queryInput.value,'env:prod service:api status namespace:"payments core"');

el.queryInput.value="service:old env:dev keep";
assert.equal(c.applyTopologyFilter({kind:"service",value:"auth api",scopeKind:"environment",scopeValue:"prod eu"}),true);
assert.equal(el.queryInput.value,'keep service:"auth api" env:"prod eu"');

const before=el.queryInput.value;
assert.equal(c.applyTopologyFilter({kind:"unsupported",value:"x",scopeKind:"wat",scopeValue:"y"}),false);
assert.equal(el.queryInput.value,before);

assert.equal(c.quoteIfNeeded('  alpha beta  '),'"alpha beta"');
assert.equal(c.quoteIfNeeded('alpha"beta'),"alphabeta");
assert.equal(c.operatorFor("ns"),"namespace");
assert.equal(c.operatorFor("wat"),"");
assert.ok(Object.isFrozen(host.SignalDockQueryNavigationController));
console.log("query-navigation-controller-smoke PASS");