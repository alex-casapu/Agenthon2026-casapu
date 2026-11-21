# La demo di tre minuti, raccontata

Questo documento racconta la demo come una storia. I dettagli strutturati (tabelle, identificativi, domande esatte) sono in un altro documento, "Scenario: il prezzo della semola sale". Tutti i dati sono inventati: Barilla è usata come azienda simulata.

## La situazione di partenza

Siamo il 21 novembre 2026. Barilla produce pasta nello stabilimento di Parma e compra semola di grano duro. Per il 60% del fabbisogno ha un contratto quadro a prezzo fisso, 412 euro alla tonnellata, valido fino al 31 marzo 2027, con il fornitore Molino Tavoliere. Il restante 40% lo compra sul mercato, a prezzo variabile. Il fabbisogno dello stabilimento è di 4.000 tonnellate al mese. Le scorte coprono 9 giorni di produzione.

In più, l'ufficio acquisti ha in mano un'offerta di un altro mulino, Mulino Alta Murgia: 3.000 tonnellate a 470 euro alla tonnellata, consegne a dicembre e gennaio, valida fino al 28 novembre, cioè tra una settimana.

Il prezzo di mercato della semola a ottobre era 425 euro alla tonnellata. Tutte queste informazioni sono già nella memoria, approvata dalle persone.

Le persone coinvolte sono tre: Marta Ricci, responsabile Acquisti, che cura la memoria e può vedere tutto; Luca Bianchi, di Finance, che vede contratti e offerte; Sara Conti, di Produzione, che vede solo le informazioni pubbliche, come il mercato, il fabbisogno e le scorte.

## Primo atto: arriva il report

Esce un report di mercato: il prezzo spot è salito a 502 euro alla tonnellata, il 18% in più in tre settimane. Nessuno in azienda ha ancora fatto i conti. Finance conosce i contratti, Produzione conosce le scorte, Acquisti ha l'offerta. Le informazioni ci sono, ma in posti diversi.

**L'agente se ne accorge da solo.** Senza che nessuno chieda nulla, scrive un messaggio ad Acquisti nel canale di lavoro, in stile Slack. Il messaggio dice, in sostanza: il rincaro costa alla parte non coperta dal contratto circa 123.000 euro in più al mese, circa 493.000 fino a marzo; e propone un'azione, anticipare l'acquisto di 3.000 tonnellate da Mulino Alta Murgia a 470 euro, con un risparmio stimato di 96.000 euro rispetto al prezzo di mercato. Chiude con la frase: nulla è stato eseguito, serve la tua approvazione.

I numeri tornano: 502 meno 425 fa 77 euro; la parte non coperta è il 40% di 4.000, cioè 1.600 tonnellate al mese; 77 per 1.600 fa 123.200 euro al mese.

## Secondo atto: le persone curano la memoria

Tra le proposte dell'agente ce n'è anche una più debole: un messaggio nella chat del team, scritto da un commerciale, dice "mi dicono da fuori che il raccolto canadese è messo peggio del previsto e che i prezzi continueranno a salire, non ho conferme". L'agente la propone come ipotesi a bassa affidabilità.

Marta fa una domanda: "di quanto è salito il prezzo della semola?". Il sistema risponde: **non lo so**, perché esiste una proposta in attesa di validazione, e finché una persona non la approva non la usa.

Marta approva la conclusione sul rialzo e quella sul costo, e **rifiuta l'ipotesi sul raccolto**. Rifà la domanda: ora il sistema risponde con il numero e **cita le sue fonti**. Chiede poi del raccolto canadese: il sistema dice che non lo sa, perché quell'ipotesi è stata rifiutata, ma precisa che la prova resta nel registro. Questo mostra la differenza tra "non usare" e "cancellare".

## Terzo atto: ognuno vede solo ciò che gli compete

Si cambia persona. Si chiede "qual è il prezzo del nostro contratto quadro?". Luca, di Finance, riceve la risposta: 412 euro alla tonnellata, con la fonte. Sara, di Produzione, riceve **"non autorizzato"**, perché il contratto è riservato a Finance.

La regola vale anche per le conclusioni derivate: una conclusione è visibile a una persona solo se questa può vedere tutte le prove su cui si basa. Quindi chiedere il costo del rincaro, che si calcola partendo dal contratto, non permette di aggirare il divieto.

Poi una domanda fuori dai dati: "quanto costa la semola in Turchia?". Il sistema risponde semplicemente **non lo so**.

## Quarto atto: il colpo di scena, la rettifica

Arriva un secondo bollettino che corregge il primo: il +18% valeva solo per il mercato di Foggia in una settimana di picco. La media nazionale è 478 euro alla tonnellata, +12,5%.

Qui si vede il punto di forza della tecnologia. L'agente **non riscrive nulla**. La prova vecchia resta nel registro, collegata a quella nuova che dice di averla superata. Le conclusioni che dipendevano dalla prova vecchia (il rialzo del 18%, il costo di 123.000 euro, l'azione di acquisto) passano automaticamente allo stato "da rivedere". L'agente propone le versioni aggiornate: il costo scende a circa 84.800 euro al mese, e il risparmio dell'acquisto anticipato si riduce da 96.000 a 24.000 euro. L'azione resta conveniente, ma molto meno: ecco perché serve rivedere prima di agire.

## Quinto atto: l'azione, solo dopo l'approvazione

Un pannello mostra lo stato dei sistemi aziendali: l'ordine di anticipo è "nessuno". Resta così anche mentre l'azione aggiornata è sul tavolo. Solo quando Marta approva, compare l'ordine di acquisto, 3.000 tonnellate da Mulino Alta Murgia a 470 euro. **Prima dell'approvazione non è successo nulla.**

## Finale: la domanda sul perché

Alla fine si chiede: "perché abbiamo comprato 3.000 tonnellate da Mulino Alta Murgia?". Il sistema ricostruisce la catena completa: l'azione, chi l'ha approvata e quando, le conclusioni su cui poggiava, le prove originali e anche le versioni superate dalla rettifica. È la dimostrazione che dietro non c'è una scatola nera ma un percorso che si può controllare.

## Cosa la demo dimostra

Passo dopo passo copre i sette controlli della traccia: l'agente parla per primo, le persone curano la memoria, ognuno vede solo ciò che gli compete, le risposte citano le fonti, il sistema ammette di non sapere, le azioni restano proposte finché una persona non approva, e il tutto avviene dove il team lavora, in un canale di messaggistica.

In più, la rettifica e la domanda finale mostrano il vantaggio che è solo nostro: le prove non si cancellano mai e le conclusioni sanno da cosa dipendono.
