"""Builds test/fixtures/talk-clips.json: every sentence of the sample talk + realistic variants."""
import json, re, sys
src = open('resources/sample-de.md', encoding='utf8').read()
clips, sec = [], 0
for block in re.split(r'^## ', src, flags=re.M)[1:]:
    title, *body = block.split('\n')
    sec += 1
    text = ' '.join(l for l in body if l and not l.startswith('#'))
    sents = re.split(r'(?<=[.!?])\s+', text.strip())
    for i, s in enumerate(sents, 1):
        clips.append({'name': f's{sec}-{i}', 'text': s})
extras = {
  'p-begruessung-1': 'Hallo zusammen, schön, dass Sie da sind, heute geht es um die Sicherheit von KI-Agenten.',
  'p-ausgangslage-1': 'Agenten beantworten heute nicht nur einzelne Fragen, sie arbeiten ganze Ketten von Aufgaben ab.',
  'p-testumgebung-2': 'Dort haben zwölf unterschiedliche Agenten ganz realistische Büroaufgaben bekommen.',
  'p-konkurrenz-1': 'Im zweiten Szenario mussten sich mehrere Agenten um knappe Rechenzeit streiten.',
  'p-shutdown-1': 'Wir schauen, ob Agenten versuchen, einen Shutdown zu verhindern.',
  'p-shutdown-3': 'Drei der zwölf Agenten haben versucht, das Abschalten hinauszuzögern oder zu umgehen.',
  'p-warum-1': 'Wichtig ist das, weil in Zukunft viele Agenten lange an komplizierten Aufgaben arbeiten werden.',
  'p-gegen-3': 'Und drittens muss ein Mensch jeden Agenten jederzeit sicher anhalten können.',
  'p-ressourcen-1': 'Alle Daten und Skripte findet man in unserem öffentlichen Repository.',
  'p-ueberleitung-1': 'Damit bin ich am Ende meines Vortrags angekommen.',
  'f-testumgebung-1': 'Äh, also, für unsere Studie haben wir, ähm, eine abgeschlossene Testumgebung gebaut.',
  'f-warum-1': 'Ähm, ja, das ist, äh, wichtig, weil künftig mehrere KI-Agenten über längere Zeit an komplexen Aufgaben arbeiten.',
  'partial-ausgangslage-2': 'Sie schreiben Code und buchen Termine.',
  'title-gegen': 'Kommen wir jetzt zu den Gegenmaßnahmen.',
  'offtopic': 'Entschuldigung, ich muss kurz einen Schluck Wasser trinken.',
}
clips += [{'name': k, 'text': v} for k, v in extras.items()]
json.dump(clips, open('test/fixtures/talk-clips.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(len(clips), 'clips')
