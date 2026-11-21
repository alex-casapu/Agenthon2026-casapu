# La sfida dell'hackathon

## Il contesto

Stiamo partecipando a un hackathon organizzato da GDG, nella Track 1, intitolata "Agentic AI for business" (intelligenza artificiale agentica per le aziende), con sponsor Ariete Tech Solutions. Il tema è costruire **un'intelligenza artificiale di cui un team si fiderebbe**.

L'idea di fondo della traccia: un'AI che lavora in background e **chiede prima di agire**, e che poi va difesa dal vivo davanti a una giuria e a squadre rivali che cercano di romperla.

## Cosa premia la giuria

La traccia è esplicita: **le dimostrazioni scenografiche non vincono**. Vince la build che è corretta, che ammette ciò che non sa e che non agisce mai senza l'approvazione di una persona. Questo orienta tutte le nostre scelte: meglio una demo sobria che funziona sempre, che una demo spettacolare e fragile.

## Le due sfide e quella che abbiamo scelto

Ci sono due sfide possibili. Noi abbiamo scelto la **Challenge A, "Company Brain"**, descritta come "il collega che sa e parla per primo".

Si tratta di uno strumento che osserva il lavoro di un team (email, chat, task, documenti), tiene una memoria condivisa che le persone curano, e dice a ciascuno cosa richiede la sua attenzione prima ancora che lo chieda. La traccia precisa che **un chatbot che risponde a domande sui documenti non conta**: serve qualcosa di proattivo e controllato.

## I sette controlli

La demo deve durare **tre minuti** e superare **sette controlli**. La giuria marca ciascuno con un sì o con un no.

1. **Parla per primo.** Si mostra un brief o un avviso che il sistema ha creato da solo, senza che nessuno glielo abbia chiesto.
2. **Le persone curano la memoria.** Dal vivo si approva un elemento di memoria e se ne rifiuta un altro. Poi si fa una domanda a cui può rispondere solo l'elemento approvato.
3. **Sa chi sta chiedendo.** La stessa domanda viene fatta come persona di Finance e come persona tecnica. Una ottiene la risposta, l'altra no.
4. **Cita.** Ogni risposta mostra da dove viene.
5. **Ammette i vuoti.** Si chiede qualcosa che non è nei dati e il sistema risponde "non lo so".
6. **Propone soltanto.** Si mostra un'azione in attesa di approvazione. Non succede nulla finché una persona non la approva.
7. **Si inserisce nella giornata del team.** Si mostra dove il team lo incontrerebbe: una finestra di chat, un'email del mattino, un mock-up in stile Slack. Non serve nessuna connessione reale.

## Cosa ne deduciamo

Alcune conseguenze pratiche, che hanno guidato il disegno della demo:

- **Sono sette sì/no.** Un controllo mancato è un punto perso, quindi la copertura completa conta più della rifinitura.
- **I controlli 3, 5 e 6 sono i punti di attacco.** È lì che i team rivali proveranno a far sbagliare il sistema: farsi dare dati che non dovrebbero vedere, far inventare risposte, far eseguire azioni non approvate. Per questo permessi, rifiuti e coda delle azioni devono essere regole certe, non semplici istruzioni a un modello linguistico.
- **L'auditability non è un controllo in sé.** La traccia non premia esplicitamente la tracciabilità. Il nostro vantaggio tecnico (le prove che non si cancellano mai, le conclusioni collegate alle prove) conta solo se lo si fa vedere in modo chiaro nella demo.
- **Bastano dati simulati.** La traccia dice che non serve nessuna connessione reale: si può costruire un mondo finto, purché credibile e coerente.

## La nostra scelta strategica

Invece di una demo generica, abbiamo deciso di costruire **un mondo simulato** di un'azienda industriale (Barilla, con dati tutti inventati), inserire in quel mondo un problema concreto e mostrare come la nostra tecnologia lo risolve. Il problema scelto è un improvviso rialzo del prezzo della semola. I prossimi documenti raccontano perché e come.
