# SCORM 2004 4th Edition — porting browser, versione 0.1 sperimentale

Questa versione sostituisce gli applet Java e il trasporto LiveConnect della parte **LMS Test** della suite ADL con JavaScript eseguito nel browser del discente. Non serve installare Java, Ant o una VM e non serve un servizio backend aggiuntivo.

È un porting indipendente, non una nuova release ADL. L'equivalenza completa con la suite originale **non è ancora validata**. Le funzionalità Content Package Test, SCO Test, Manifest Test e Checksum della suite originale non sono portate. I file legacy rimangono disponibili nel sorgente.

## Inizia dai pacchetti pronti

1. Estrai l'archivio esterno. Nella cartella `packages` trovi 189 ZIP; importa **gli ZIP interni**, senza estrarli, nella normale funzione SCORM della tua FAD. Non importare l'archivio esterno come corso.
2. Parti da `LMSTestPackage_API_modern.zip`. Poi usa DMI e DMB. Servono SCORM **2004 4th Edition**, importazione multi-SCO e gestione del manifest: il solo supporto al singolo SCO non basta per l'intera suite.
3. Usa una piattaforma di test e discenti fittizi: questi corsi modificano intenzionalmente dati, punteggi, stato, tempo e obiettivi. Come nel manuale ADL, usa un discente per API e un secondo per gli altri scenari.
4. Apri il corso nel normale player della FAD, da Chrome/Edge. Nella pagina inserisci una sessione identificativa, ad esempio `smartfad-01`, e **l'ID SCORM reale del discente atteso**, ricavato dalla piattaforma. Premi **Avvia / continua**. L'ID non viene dedotto dalla risposta da verificare.
5. Segui le istruzioni originali ADL, rimaste in inglese. Per API: avvia prima l'asset, poi API Implementation Test 1 e quindi Test 2, tramite i controlli della FAD. Il primo asset non chiama Initialize. DMI e DMB richiedono più visite: non scegliere arbitrariamente il prossimo SCO.
6. A ogni nuovo lancio premi Avvia / continua: i campi sono precompilati. L'esecuzione non parte automaticamente. In caso di controlli UI, rispondi in base a quello che il player mostra; risposte non ancora fornite non contano come PASS.
7. Esporta i log con **Esporta JSON**. Il file contiene chiamata, argomenti, valore atteso, valore ricevuto, errore, ID del comando originale e versione sorgente.
8. Puoi aprire `report.html` dal tuo PC e selezionare più JSON per consultarli insieme. Non invia dati all'esterno.

Se il player chiude subito l'ultima pagina, riaprila e usa **Carica solo log**, poi Esporta JSON. Carica solo log non chiama l'API né esegue il test. Il report è recuperabile soltanto dallo stesso browser, profilo e origine dei contenuti.

## Stato, ripetizioni e ambiente

- I log e il cursore della sequenza sono compressi e conservati in localStorage, separati per sessione, discente e scenario. Non vengono salvati dentro `cmi.suspend_data`: quel campo è sotto test.
- Usa una sola scheda di esecuzione per scenario/sessione. Non usare due finestre sullo stesso scenario. Il blocco tra schede è una protezione pratica, non una transazione distribuita.
- Disattivare/cancellare lo storage o cambiare origine dei contenuti interrompe la continuità. Non è previsto il trasferimento automatico del cursore tra dispositivi.
- Per rifare un test: esporta i risultati, ripristina il tentativo LMS (o usa un nuovo discente) e scegli un nuovo identificativo di sessione. Cambiare il nome della sessione da solo **non** azzera lo stato della FAD. Per una ripetizione completa, il manuale ADL richiede rimozione dei pacchetti e degli obiettivi globali associati.
- Gli scenari possono condividere obiettivi globali: segui l'ordine della suite originale. DDMa e DDMb condividono intenzionalmente il medesimo scenario/cursore DDM e vanno eseguiti secondo le istruzioni, nella stessa origine e con lo stesso discente.
- Serve accesso JavaScript a `API_1484_11` tramite parent/opener. Un iframe cross-origin/sandboxed richiede il bridge sincrono previsto dal tuo LMS. Questo porting non aggira la same-origin policy.
- Se la pagina presenta BLOCKED, esporta il JSON: può essere un problema del porting/configurazione, non necessariamente una non conformità del player.

## Che cosa è stato conservato

- 189 manifest/pacchetti, corrispondenti a 188 scenari ADL (DDM usa due pacchetti).
- Organizzazioni, identificatori delle attività, parametri di lancio, metadati, regole di sequenziamento e obiettivi dei manifest originali.
- Ordine dei comandi e delle visite, incluse chiavi duplicate nei file `.properties`.
- Logica JavaScript delle pagine originali, domande UI e istruzioni. Solo applet, caricamento delle vecchie librerie e collegamento al driver sono sostituiti.
- Ricerca dell'API, chiamate sincrone, GetLastError, risoluzione degli indici di obiettivi/dati tramite ID, confronto insiemistico degli obiettivi, verifica dell'attività attesa.

I file `inventory.json` e `modern/build.py` rendono riproducibile la trasformazione. Il commit ADL di riferimento è `050f1b4282c914154ab80254e4767ce8c58d0d36`.

## Interpretazione dei risultati e limiti

**PASS** significa che le verifiche implementate ed eseguite nello scenario sono riuscite; non significa che tutta la suite originale sia stata riprodotta o che l'intero LMS sia conforme. **FAIL** indica una differenza rilevata. **REVIEW** richiede verifica tecnica. **INCOMPLETE** indica visite mancanti. **BLOCKED** indica test non terminabile o errore del runner/configurazione. Nessuna verifica non implementata viene convertita automaticamente in PASS.

Limiti noti:

1. I confronti Java del modello dati non sono stati tradotti integralmente. Sono implementati confronto esatto, numeri, durate, `_children`, ID dinamici e alcune regole specifiche ADL. Valori tipizzati non identici (per esempio pattern complessi di interazione, stringhe localizzate o timestamp semanticamente equivalenti) generano REVIEW. Non è una validazione completa delle grammatiche dei tipi.
2. I test con `Terminate` nella lista dei comandi non hanno sempre risultati attesi espliciti nella sorgente: vengono segnalati REVIEW. Le chiamate finali Terminate delle pagine hanno controlli aggiuntivi espliciti.
3. Gli scenari basati su `unload` usano `pagehide`, e quelli post-terminazione richiedono REVIEW. Un browser può omettere eventi in caso di chiusura forzata, crash o sospensione. Non dichiarare equivalenza con IE per questi scenari.
4. I sei scenari con conferma esterna della fine della sessione di sequenziamento richiedono REVIEW: il controller originale esterno alla FAD non è stato ricreato. L'ultima pagina del corso non può sempre osservare ciò che accade dopo che è stata rimossa.
5. DMI `Act3V2.commands.47` nella repository manca del prefisso `GET->`. Il generatore lo aggiunge, conserva `originalRaw` e registra REVIEW nel report. È una correzione inferita, non un aggiornamento ufficiale ADL.
6. Alcune regole permissive della suite ADL sono conservate e annotate: `learner_name` controlla solo il codice d'errore; `request_valid` verifica il vocabolario; `GetDiagnostic` verifica la lunghezza. Non sono state sostituite silenziosamente con regole più restrittive.
7. Non è stato svolto un confronto differenziale esaustivo con l'esecuzione Java originale, né una prova contro la FAD dell'utente. Tutti i 189 ZIP sono generati e controllati strutturalmente, ma non tutti i percorsi sono stati eseguiti end-to-end su un LMS completo.
8. Le stringhe delle pagine originali che parlano di "conformance" sono conservate come testo storico: per l'esito usa il pannello e il JSON del porting.

## Ricompilazione e test

Nel sorgente incluso, dalla cartella `source/modern`:

```sh
python build.py
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/core.test.js
```

`build.py` usa Python 3.10+ e la libreria standard; non richiede Ant o Java. Il sorgente nell'archivio contiene `UPSTREAM_COMMIT.txt` per ricompilare anche senza `.git`. I pacchetti generati si trovano in `modern/dist`.

Per l'integrazione Chromium (Node.js e download browser necessari solo allo sviluppatore):

```sh
npm install
npx playwright install chromium
npm run test:browser
```

Il test browser usa un **LMS fittizio**, non un oracolo di conformità: verifica il funzionamento del runner, errori e persistenza. Per validare il tuo player devi importare gli ZIP nella FAD.

## File

- `packages/`: ZIP pronti da importare.
- `report.html`: lettore locale dei JSON.
- `source/`: repository ADL originale più cartella `modern/` modificata.
- `inventory.json`: elenco pacchetti, conteggi e hash.
- `VALIDATION.txt`: verifiche effettivamente eseguite.

Licenza originale e modifiche: Apache 2.0. Compressione pako: MIT, con licenza inclusa. Il progetto non carica dipendenze da CDN durante l'uso dei corsi.
