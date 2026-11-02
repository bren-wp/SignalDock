# SignalDock — sigurnosni i dead-code audit (2026-11-02)

## Opseg i metodologija

Polazni commit: `a5a6d98c8bbce9f1ae5635cd1c18e9ec90624be3` (`main`).
Pregledani su GitHub repozitorij, manifest stabla, ulazne točke, ZIP/parser i persistence moduli, sigurnosna dokumentacija te CI/CodeQL konfiguracija.
Prikupljena su imena svih produkcijskih JavaScript modula i uspoređena s HTML `script src` referencama.

**Ograničenja:** Ovo nije potpuni penetracijski test, automatski pregled svih funkcija ni izvedena end-to-end provjera svakog ekrana. Nalazi su razdvojeni na potvrđene činjenice, sanirane rizike i daljnje provjere. Ne postoji jamstvo da je softver bez pogrešaka.

## Nalazi i provedeni ispravci

| Prioritet | Područje | Nalaz | Promjena |
| --- | --- | --- | --- |
| Visok | ZIP import | Raniji kod ograničavao je raspakiranu veličinu prema nepouzdanim ZIP metapodacima; stvarni DEFLATE tok čitan je bez inkrementalnog ograničenja. | `src/vendor/zip.js`: streaming budget, usporedba stvarne veličine, CRC-32, validacija zaglavlja i granica. |
| Srednji | Memorija pri uvozu | ZIP je učitavan putem `arrayBuffer()` bez posebnog ograničenja komprimirane veličine. | `src/core/parser.js`: odbijanje ZIP datoteka većih od 300 MiB prije alokacije cijelog arhiva. |
| Srednji | IndexedDB transakcije | Sinkrona pogreška nakon prethodno zakazanih upisa mogla je ostaviti transakciju bez eksplicitnog prekida. | `src/core/persistence.js`: poziv `tx.abort()` pri pogrešci pripreme transakcije. |
| Nizak | CSP | Postojeće CSP politike nisu izričito zabranjivale ugniježđene okvire. | `frame-src 'none'` na četiri HTML stranice. |
| Nizak | Security disclosure i privatnost | Postupak prijave mogao je potaknuti javno otvaranje sigurnosnog issuea; granice zaštite lokalno spremljenih logova nisu bile dovoljno jasne. | Ažuriran `SECURITY.md`. |

Rizik ZIP dekompresije procijenjen je na temelju implementacije; nije potvrđeno praktično iskorištavanje na korisničkom uređaju.

## Dead-code inventura

- `73` produkcijska JavaScript modula u `src/`.
- `74` `script src` reference, uključujući `app.js`.
- `0` nepovezanih `src/` JavaScript datoteka prema HTML ulaznim točkama.
- `0` dupliciranih `script src` referenci.
- `filter-worker.js` nije učitan kao skripta glavnog UI threada; koristi se kao zasebna Worker ulazna točka.

Dodana je regresijska provjera `tests/dead-code-entrypoints-smoke.mjs`.
Ova inventura **ne otkriva** nekorištene funkcije, izvoze, uvjetne grane ni stilove. Brisanje na temelju pukog pretraživanja naziva bilo bi rizično.

## Provjera regresija

Nova datoteka `tests/zip-security-smoke.mjs` provjerava:
- legitimne stored i DEFLATE ZIP arhive;
- lažno malu/veliku deklariranu veličinu;
- neispravan CRC;
- opasne relativne i apsolutne putanje;
- enkripcijske oznake i nedopuštene ZIP64 metapodatke;
- nesklad centralnih/lokalnih zaglavlja i nevaljane offsete.

`tests/static-audit.mjs` dodatno zahtijeva `connect-src 'none'` i `frame-src 'none'` u svim HTML stranicama.

**Status na dan izvješća:** GitHub Actions (SignalDock CI i CodeQL) pokrenuti su za PR; njihovi zaključci moraju biti provjereni prije spajanja. Prolazak automatiziranih testova ne zamjenjuje ručni QA.

## Daljnje kontrole nužne za potpunu verifikaciju

1. End-to-end provjera svakog uvoza, parser profila, smart-query filtra, trace analitike, tablica, izvoza, spremanja slučajeva, Project Reopen i IndexedDB oporavka.
2. Stres-test korisničkih regularnih izraza (ReDoS), uključujući custom parser profile i nekontrolirano velike redove logova.
3. Testovi istodobnog autosave/load/clear rada nad IndexedDB, integriteta cachea i oporavka nakon prekida.
4. Pregled svih DOM sinkova na XSS, worker poruka na autentikaciju protokola te datotečnih izvoznih putanja.
5. Test svih relevantnih preglednika (Chromium, Firefox, WebKit), različitih OS-ova i različitih veličina zaslona.
6. Provjera access-control i workflow permissions, statusa CodeQL nalaza, izdavanja verzija i oporavka releasea.
7. Simbolički dead-code audit: reference funkcija, javni API-ji, event handleri, CSS selektori i dinamičko pozivanje, uz testove prije uklanjanja.
8. Dokumentiranje potrošnje memorije na velikim arhivima i opcije prekida dugotrajnih operacija.

## Kriterij za spajanje

Spojiti PR nakon uspješnih CI/CodeQL provjera, provjere regresija u preglednicima i pregleda razlika u kodu. Ne mijenjati verziju ili izdavati release samo zato što je audit pokrenut.
