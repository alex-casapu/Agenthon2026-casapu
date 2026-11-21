# Come funziona il sistema (Company Brain)

Questo documento descrive l'architettura del sistema come è pensata nel progetto. Alla fine c'è una sezione sullo stato di avanzamento, perché una parte è già costruita e una parte no.

## Il percorso di un'informazione

Il flusso, in parole semplici, è questo:

1. **Fonti.** Un'email, un documento, un referto entra nel sistema e viene conservato così com'è, immutabile.
2. **Estrazione.** Un modello linguistico legge la fonte e ne ricava dei fatti piccoli e singoli, chiamati "claim". Ogni claim porta con sé una **citazione letterale** presa dalla fonte.
3. **Controllo deterministico (il "gate").** Prima che qualunque cosa venga salvata, un controllo senza intelligenza artificiale verifica che la citazione esista davvero nella fonte e che ogni valore (numeri, date, unità) sia leggibile da quella citazione. Se non torna, il claim non entra.
4. **Claim proposti.** I fatti che passano il controllo restano in stato "proposto".
5. **Cura umana.** Una persona li approva o li rifiuta.
6. **Memoria approvata.** Solo i fatti approvati diventano memoria su cui il sistema risponde.

Poi, da lì, il sistema fa tre cose: avvisa le persone di ciò che richiede attenzione (il brief proattivo), risponde alle domande, e propone azioni che attendono l'approvazione.

## Le idee chiave

**Fatti piccoli, ancorati a citazioni.** Ogni fatto è un mattoncino con la sua citazione letterale. Il vantaggio: un errore del modello non passa inosservato, perché il controllo verifica la citazione e i valori letteralmente.

**L'errore del modello è contenuto.** I campi di un fatto sono di tre tipi. I campi *letterali* devono essere leggibili dalla citazione e si verificano in modo meccanico. I campi *risolti* sono ricalcolati da un risolutore deterministico (date, unità, valute). I campi *interpretativi* sono rivisti da una persona.

**Un registro che non si può manomettere.** Le tabelle sono "solo aggiunta": non si modifica né si cancella nulla. Esiste una catena di hash globale, come una catena di sigilli, e una funzione di verifica che può ricontrollare tutto.

**Lo stato derivato è una funzione del registro e delle regole.** Se una fonte si rivela inaffidabile, o se arriva una rettifica, tutto ciò che ne dipende viene ricalcolato, e si vede chiaramente cosa è stato toccato (il "raggio d'azione" dell'effetto).

**La proattività è una domanda, non un'intuizione.** Poiché i fatti sono tipizzati e legati al tempo, scoprire una contraddizione, una scadenza vicina o un conto che non torna tra fatti diversi è un'operazione deterministica, non un'ipotesi del modello.

**Accesso deterministico.** Le regole su chi può vedere cosa vengono applicate **prima** di qualsiasi chiamata a un modello. Un fatto derivato eredita il livello di riservatezza più restrittivo delle sue fonti. Così non si può aggirare un divieto chiedendo una conclusione al posto della prova.

**Gli agenti si limitano a proporre.** Le azioni finiscono in una coda. L'approvazione di una persona è legata alla prova su cui si basa l'azione, tramite l'hash: se la prova cambia, l'approvazione non vale più.

## Dove entra il modello linguistico

Il modello compare in quattro punti soltanto: l'estrazione dei fatti dalle fonti, la scrittura dei brief, la redazione delle risposte, e la proposta di nuovi tipi di fatto. Dopo ciascun punto c'è sempre un controllo deterministico. Questo è il motivo per cui il sistema può essere difeso davanti a una giuria: i permessi, le citazioni, i rifiuti e la coda delle azioni non dipendono dall'umore di un modello.

Per rendere la demo ripetibile, le chiamate al modello usano un meccanismo di registrazione e riproduzione: la prima volta si registra la risposta, poi la si riproduce identica.

## Rifiuto e "non lo so"

Se per una domanda non esistono fatti approvati e visibili alla persona che chiede, il sistema non inventa: risponde che non ha prove approvate su quel tema. Questo vale anche per i fatti proposti ma non ancora approvati, e per quelli rifiutati.

## Tecnologie

Tutto in TypeScript. L'interfaccia web è in Next.js. Il database è SQLite. Le migrazioni sono scritte a mano. Per i controlli di forma si usa una libreria di validazione e per i test un framework di test. Le chiamate al modello passano da un comando a riga di comando, con registrazione e riproduzione.

## Stato di avanzamento

**Già fatto:** fonti, citazioni, claim, eventi sui claim, catena di hash e verifica; il controllo (gate) con le verifiche su citazioni, valori letterali, risolti e interpretativi; le migrazioni con checksum e il registro dei tipi di fatto; un banco di lavoro web per inserire fonti, proporre fatti passando dal controllo, approvare e rifiutare, e evidenziare le citazioni.

**Prossimi passi:** registro delle entità; estrazione con modello e ciclo di riparazione; regole di accesso ed etichette di riservatezza; motore di derivazione e "diffida di una fonte" con raggio d'azione; trigger che producono brief proattivi (web, mock in stile Slack, email del mattino); risposte con verifica delle citazioni e "non lo so"; proposte d'azione, approvazione ed esecutore finto; generatore di scenari con risposte attese.

**Ipotesi future (stretch):** raggruppare affermazioni per proporre nuovi tipi di fatto; coda di cura ordinata per impatto; corroborazione che tiene conto dell'indipendenza delle fonti.

## Come si collega alla demo

Il piano di demo del progetto prevede, in sequenza: un brief non richiesto, l'approvazione di un fatto e il rifiuto di un altro, una risposta citata che solo il fatto approvato permette, la stessa domanda fatta con due ruoli, una domanda fuori dai dati che riceve "non lo so", un'azione che attende e poi viene approvata, e infine la diffida di una fonte con riscrittura del brief. Lo scenario del prezzo della semola usa la rettifica di un report come modo concreto di mostrare lo stesso effetto: quando una prova cambia, le conclusioni che ne dipendevano vengono ricalcolate.
