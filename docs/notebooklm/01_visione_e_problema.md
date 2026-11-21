# La visione: una memoria aziendale che sa dire perché

## Il problema che nessuno vede

In un'azienda grande le decisioni poggiano su moltissimi fatti: un prezzo letto in un report, una clausola in un contratto, una frase in un'email, un numero in un foglio Excel. Questi fatti cambiano continuamente. E quasi sempre succede la stessa cosa: dopo qualche settimana nessuno sa più dire **perché una certa cosa è considerata vera**.

Si perdono tre cose, ogni giorno:

1. **La provenienza.** Da dove viene questo numero? Chi l'ha detto? Quando?
2. **La storia.** Cosa pensavamo prima? Cosa è cambiato, e quando?
3. **Le dipendenze.** Se questo fatto cade, quali decisioni vanno riviste?

Il risultato sono ore perse a cercare nelle caselle di posta, riunioni che ripercorrono il contesto invece di decidere, e decisioni prese su informazioni che nel frattempo sono diventate false, senza che nessuno avvisi.

## L'idea in parole semplici

La tecnologia che stiamo costruendo è una **memoria aziendale auditabile**. Si regge su due ingredienti, volutamente semplici.

**Le evidenze.** Sono le prove: un documento, un'email, un referto, una riga di un sistema. Ogni evidenza viene registrata così com'è, con la sua fonte e la sua data. E soprattutto **non viene mai cancellata né modificata**. Il registro delle evidenze è "append-only": si possono solo aggiungere righe. Se una prova si rivela sbagliata o superata, non si corregge la riga vecchia: si aggiunge una nuova prova che dice che la vecchia è stata superata. La storia resta sempre intera.

**Le implicazioni.** Sono le conclusioni che si ricavano dalle prove. L'esempio classico: l'evidenza "a Torino piove" porta all'implicazione "a Torino il terreno è bagnato". Un agente di intelligenza artificiale legge le evidenze e ne ricava le implicazioni. Ogni implicazione resta collegata alle prove su cui poggia.

Nota sulla terminologia: nel codice del progetto le unità di conoscenza si chiamano "claim" (affermazioni) e ognuna porta con sé una citazione letterale dalla fonte. Il concetto è lo stesso: un fatto piccolo, singolo, tracciabile fino alla sua origine. Per questo si dice che la memoria è "atomizzata": ogni fatto è un mattoncino a sé.

## Perché questo cambia le cose

Siccome ogni conclusione sa su quali prove poggia, succedono cose che un normale archivio di documenti, o un chatbot che legge documenti, non sa fare.

- **Quando una prova cambia, si sa esattamente cosa è toccato.** Se arriva un secondo report che corregge il primo, tutte le conclusioni che dipendevano dal primo vengono segnalate come "da rivedere". Non si rilegge tutto, si rivede solo ciò che serve.
- **Ogni risposta può mostrare le sue fonti.** Non "secondo me", ma "secondo questo documento, di questa data".
- **Si può ricostruire cosa sapeva l'azienda in un dato momento.** Utile per un revisore, per un'autorità, o semplicemente per capire una decisione presa mesi prima.
- **Una prova sbagliata non inquina il sistema.** Una persona può rifiutare una conclusione dubbia: la prova resta nel registro (si vede che esisteva), ma l'agente smette di usarla.

## Il ruolo delle persone

Il sistema non decide da solo. Le conclusioni proposte dall'agente restano in attesa finché una persona non le approva o le rifiuta. È la persona che "cura" la memoria. Allo stesso modo, quando l'agente propone un'azione concreta, per esempio anticipare un acquisto, **l'azione non parte finché una persona non la approva**.

Questa è la parte che rende il sistema affidabile: l'intelligenza artificiale propone, gli esseri umani decidono, e tutto lascia una traccia.

## In una frase

Una memoria condivisa in cui ogni fatto ha la sua prova, nulla viene mai cancellato, ogni conclusione sa da dove viene, e nessuna azione parte senza il via libera di una persona.
