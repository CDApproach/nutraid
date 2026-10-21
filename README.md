# Nährwerte

Ernährungstagebuch im Stil von Cronometer: Was du isst, wird gegen die D-A-CH-Referenzwerte (DGE) für
alle Vitamine, Mineralstoffe, essentiellen Fett- und Aminosäuren gerechnet. Dazu kommen ausgewählte
sekundäre Pflanzenstoffe mit solider Studienlage (Beta-Glucan, Lutein, Beta-Carotin, Lycopin,
Flavonoide, Glucosinolate, Lauch-Schwefelverbindungen).

- Eingabe als Freitext: „2 Eier“, „150 g Haferflocken“, „Brokkoli 1 Portion“, „1 Glas Milch“
- Lernt, was du wann isst, merkt sich Mengen und schlägt Kombinationen vor („Dazu isst du oft …“)
- Tag / 7 Tage / 30 Tage Ø, Lückenanalyse mit Vorschlägen, Verlauf als Balken und Heatmap
- Eigene Lebensmittel (auch per Open-Food-Facts-Suche) und Rezepte
- Alle Daten bleiben lokal im Browser (localStorage), Sicherung als JSON-Datei

## Als App aufs Handy (GitHub Pages)

1. Neues GitHub-Repo anlegen und diesen Stand pushen.
2. Im Repo unter *Settings → Pages → Build and deployment* als Quelle **GitHub Actions** wählen.
   Der Workflow `.github/workflows/pages.yml` veröffentlicht danach jeden Push auf `main`.
3. Die Pages-Adresse auf dem Handy in Vanadium (GrapheneOS) oder Chrome öffnen,
   im Menü (⋮) **„App installieren“** bzw. **„Zum Startbildschirm hinzufügen“** wählen.

Die App läuft danach im eigenen Fenster und komplett offline. Neue Versionen lädt sie im Hintergrund
und bietet „Neu laden“ an. Unter *Profil → App & Daten* siehst du, ob der Speicher dauerhaft
geschützt ist, und wann die letzte Sicherung war. Die Einträge liegen nur auf dem Gerät – wer die
Website-Daten von Vanadium löscht, löscht auch das Tagebuch.

Auf GitHub Pages fehlt der lokale Proxy, daher funktioniert dort bei Open Food Facts nur die
Barcode-Suche, nicht die Namenssuche.

## Lokal starten

```bash
python3 server.py --port 8773
```

Dann http://127.0.0.1:8773 öffnen. `server.py` schaltet den Browser-Cache ab und leitet die
Open-Food-Facts-Namenssuche weiter; als reine statische Seite funktioniert alles außer dieser Suche.

## Daten neu bauen

Die Rohdaten liegen nicht im Repo (`rohdaten/`):

```bash
mkdir -p rohdaten && cd rohdaten
curl -LO https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
unzip FoodData_Central_sr_legacy_food_csv_2018-04.zip -d sr
curl -L -o flav.zip https://www.ars.usda.gov/ARSUserFiles/80400535/Data/Flav/Flav_R03-3.zip
unzip flav.zip -d flav
cd .. && python3 scripts/export_flav.py && python3 scripts/build_db.py
```

Die deutsche Lebensmittelliste mit Portionen, Synonymen und Korrekturen steht in
`scripts/lebensmittel.txt`.
