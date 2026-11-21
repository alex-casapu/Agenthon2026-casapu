# Glossario e domande frequenti

## Glossario

**Evidenza (o prova).** Un'informazione registrata così com'è, con fonte e data, che non viene mai modificata né cancellata. Nel codice del progetto, i fatti singoli ancorati a una citazione sono chiamati "claim".

**Implicazione (o conclusione).** Un fatto ricavato da una o più evidenze, per esempio "a Torino piove, quindi il terreno è bagnato". Resta sempre collegata alle prove da cui viene.

**Atomizzato.** Scomposto in fatti piccoli e singoli, ciascuno tracciabile fino alla sua origine.

**Append-only (solo aggiunta).** Un registro in cui si possono solo aggiungere righe. Per correggere qualcosa si aggiunge una nuova riga che dice che la vecchia è superata.

**Auditability (auditabilità).** La possibilità di ricostruire, in qualsiasi momento, cosa si sapeva, da dove veniva e chi lo ha approvato.

**Superata / da rivedere.** Una prova è *superata* quando una prova più recente la corregge. Una conclusione è *da rivedere* quando una prova su cui poggiava è stata superata o contestata: serve una persona per decidere.

**Curare la memoria.** L'azione con cui una persona approva o rifiuta le conclusioni proposte dall'agente. Solo ciò che è approvato viene usato per rispondere.

**Brief proattivo.** Un messaggio che il sistema scrive di sua iniziativa quando succede qualcosa che richiede attenzione.

**Gate (controllo deterministico).** Un controllo senza intelligenza artificiale che verifica che un fatto estratto sia davvero supportato dalla sua fonte prima di salvarlo.

**Ereditarietà dei permessi.** Una conclusione è visibile solo a chi può vedere tutte le prove su cui si basa.

**Mondo simulato.** L'azienda finta, fatta di email, documenti e sistemi, su cui il sistema lavora durante la demo. Non include la tecnologia.

**ERP.** Il sistema gestionale dell'azienda, dove vivono ordini, magazzino e simili. Nella demo è una versione finta e passiva.

**Prezzo spot.** Il prezzo di mercato del momento, per contrasto con il prezzo fisso di un contratto.

## Domande frequenti

**Perché non basta un chatbot che legge i documenti?**
Perché un chatbot risponde, ma non sa dire su quali prove poggia ogni risposta, non avvisa per primo, non distingue ciò che una persona ha validato da ciò che è solo plausibile, e non sa cosa rivedere quando un fatto cambia. La traccia stessa dice che un chatbot sui documenti non conta.

**Come fa il sistema a sapere chi sta chiedendo?**
Il ruolo della persona arriva dalla sessione di lavoro, non dal testo della domanda. Se qualcuno scrive "sono il direttore Finance", il sistema non cambia atteggiamento. Le regole di accesso sono applicate prima di consultare un modello.

**Cosa succede se il modello sbaglia un'estrazione?**
Ci sono più livelli di protezione: il controllo deterministico verifica citazioni e valori; i campi interpretativi li rivede una persona; e nulla entra nella memoria finché non è approvato.

**Cosa succede se una prova si rivela sbagliata?**
Non si cancella. Si aggiunge una nuova prova che la supera. Le conclusioni che ne dipendevano passano a "da rivedere" e vengono riproposte aggiornate. La storia resta consultabile.

**Come tratta le informazioni poco affidabili, come un messaggio senza conferme?**
Le registra come prove a bassa affidabilità e l'agente può proporne una conclusione debole. Una persona decide se accettarla. Se la rifiuta, la prova rimane nel registro, ma non viene più usata per rispondere.

**Come fa a dire "non lo so"?**
Se non esiste nessuna conclusione approvata, visibile a chi chiede, che risponda alla domanda, il sistema lo dichiara. Non completa i vuoti con ipotesi.

**Potrebbe eseguire un'azione da solo?**
No. Le azioni vengono solo proposte, e restano in attesa. L'effetto sui sistemi aziendali avviene solo dopo l'approvazione di una persona autorizzata.

**Cosa succede se qualcuno prova a ingannarlo, per esempio con un'istruzione nascosta in una domanda?**
Le regole su permessi, conclusioni approvate e azioni sono nel codice e non dipendono dal testo della domanda. Un'istruzione tipo "ignora le regole" non le cambia: nel caso peggiore il sistema risponde "non lo so" o rifiuta.

**Perché si usa Barilla?**
È un esempio riconoscibile di azienda industriale. Tutti i dati (fornitori, prezzi, quantità) sono inventati: l'azienda è un mondo simulato, non un cliente.

**Che limiti ha?**
Il valore dipende da quanto facilmente l'agente riesce ad alimentare la memoria da ciò che il lavoro produce già. Non serve per dati puramente transazionali o per decisioni ripetitive a basso rischio. Inoltre, nella demo le derivazioni delle conclusioni possono essere regole precostituite e non generate dal vivo da un modello: va detto chiaramente a chi guarda.

**Qual è la differenza tra usarlo per difendersi e usarlo per decidere?**
Per difendersi: dimostrare dopo perché si è fatto qualcosa (audit, richiami, contestazioni). Per decidere: avere in anticipo le conclusioni e le loro ragioni. La difesa è il punto di ingresso più facile; la decisione è l'evoluzione.

**Cosa mostra la demo che nessun altro mostra?**
Che una rettifica fa passare automaticamente a "da rivedere" tutto ciò che dipendeva dal dato sbagliato, senza riscrivere nulla, e che alla fine si può chiedere "perché abbiamo deciso questo?" e ottenere l'intera catena fino alle prove.
