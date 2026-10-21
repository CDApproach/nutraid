// Referenzwerte für Erwachsene. Quellen: DGE/ÖGE/SGE (D-A-CH-Referenzwerte),
// wo es dort keinen Wert gibt EFSA bzw. WHO. Alle Werte pro Tag.

// Altersklassen der D-A-CH-Referenzwerte: 19–24, 25–50, 51–64, ab 65
function ageIdx(age) {
  return age < 25 ? 0 : age < 51 ? 1 : age < 65 ? 2 : 3;
}
const bySexAge = (m, f) => (p) => (p.sex === "m" ? m : f)[ageIdx(p.age)];
const bySex = (m, f) => (p) => (p.sex === "m" ? m : f);

export function energyTarget(p) {
  if (p.kcalOverride) return p.kcalOverride;
  // Mifflin-St-Jeor × PAL
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === "m" ? 5 : -161);
  return Math.round((bmr * p.pal) / 10) * 10;
}

// kind: "min" = mindestens erreichen, "max" = Obergrenze, "info" = nur anzeigen
// ul = tolerierbare Höchstmenge (EFSA), ulKey falls sie sich auf einen anderen Wert bezieht
export const NUTRIENTS = [
  // Energie & Makros
  { key: "kcal", name: "Energie", unit: "kcal", group: "makro", kind: "min", target: (p, e) => e, src: "Mifflin-St-Jeor × Aktivität",
    info: "Dein geschätzter Tagesbedarf. Er hängt von Größe, Gewicht, Alter und Bewegung ab." },
  { key: "protein", name: "Protein", unit: "g", group: "makro", kind: "min", target: (p) => p.weight * (p.age >= 65 ? 1.0 : 0.8), src: "DGE",
    info: "Baustoff für Muskeln, Enzyme, Hormone und Immunzellen. DGE: 0,8 g pro kg Körpergewicht (ab 65: 1,0 g)." },
  { key: "carbs", name: "Kohlenhydrate", unit: "g", group: "makro", kind: "info", target: (p, e) => (e * 0.5) / 4, src: "DGE (> 50 % der Energie)",
    info: "Hauptenergiequelle für Gehirn und Muskeln. Am besten aus Vollkorn, Hülsenfrüchten, Gemüse und Obst." },
  { key: "fat", name: "Fett", unit: "g", group: "makro", kind: "info", target: (p, e) => (e * 0.3) / 9, src: "DGE (ca. 30 % der Energie)",
    info: "Liefert essentielle Fettsäuren und ermöglicht die Aufnahme der Vitamine A, D, E und K." },
  { key: "fiber", name: "Ballaststoffe", unit: "g", group: "makro", kind: "min", target: () => 30, src: "DGE",
    info: "Fördern Verdauung und Sättigung, nähren die Darmflora und senken das Risiko für Diabetes Typ 2, Herz-Kreislauf-Erkrankungen und Darmkrebs." },
  { key: "water", name: "Wasser (gesamt)", unit: "ml", group: "makro", kind: "min", target: bySex(2500, 2000), src: "EFSA (aus Getränken + Essen)",
    info: "Gesamtwasser aus Getränken und Lebensmitteln. Etwa 20–30 % stammen normalerweise aus dem Essen." },

  // Vitamine
  { key: "vitA", name: "Vitamin A", unit: "µg", group: "vitamin", kind: "min", target: bySex(850, 700), ul: 3000, ulKey: "retinol", src: "DGE (Retinol-Aktivitätsäquivalente)",
    info: "Wichtig für Sehen (besonders in der Dämmerung), Haut, Schleimhäute und das Immunsystem. Pflanzliche Quellen liefern Beta-Carotin, das der Körper bei Bedarf umwandelt." },
  { key: "vitD", name: "Vitamin D", unit: "µg", group: "vitamin", kind: "min", target: () => 20, ul: 100, src: "DGE (ohne Eigensynthese)",
    info: "Für Knochen, Muskeln und Immunsystem. Der Zielwert gilt ohne Sonnenlicht – im Sommer bildet die Haut den Großteil selbst. Über Essen ist er kaum erreichbar; im Winter ggf. ärztlich abklären lassen." },
  { key: "vitE", name: "Vitamin E", unit: "mg", group: "vitamin", kind: "min", target: bySexAge([15, 14, 13, 12], [12, 12, 12, 11]), ul: 300, src: "DGE",
    info: "Schützt Zellmembranen und Fettsäuren vor Oxidation. Reichlich in Pflanzenölen, Nüssen und Samen." },
  { key: "vitK", name: "Vitamin K", unit: "µg", group: "vitamin", kind: "min", target: bySexAge([70, 70, 80, 80], [60, 60, 65, 65]), src: "DGE",
    info: "Nötig für die Blutgerinnung und den Knochenstoffwechsel. Vor allem in grünem Blattgemüse." },
  { key: "vitC", name: "Vitamin C", unit: "mg", group: "vitamin", kind: "min", target: bySex(110, 95), src: "DGE",
    info: "Antioxidans, unterstützt das Immunsystem, die Kollagenbildung und verbessert die Eisenaufnahme aus Pflanzen." },
  { key: "b1", name: "Vitamin B1 (Thiamin)", unit: "mg", group: "vitamin", kind: "min", target: bySexAge([1.3, 1.2, 1.2, 1.1], [1.0, 1.0, 1.0, 1.0]), src: "DGE",
    info: "Schlüssel für den Energiestoffwechsel aus Kohlenhydraten und für Nerven. Gute Quellen: Vollkorn, Hülsenfrüchte, Schweinefleisch, Sonnenblumenkerne." },
  { key: "b2", name: "Vitamin B2 (Riboflavin)", unit: "mg", group: "vitamin", kind: "min", target: bySexAge([1.4, 1.4, 1.3, 1.3], [1.1, 1.1, 1.0, 1.0]), src: "DGE",
    info: "Beteiligt an der Energiegewinnung in den Zellen sowie an Haut und Sehen. Gute Quellen: Milchprodukte, Eier, Mandeln, Pilze." },
  { key: "niacinNE", name: "Niacin (B3)", unit: "mg", group: "vitamin", kind: "min", target: bySexAge([16, 15, 15, 14], [13, 12, 12, 11]), src: "DGE (Niacin-Äquivalente inkl. Tryptophan)",
    info: "Für Energiestoffwechsel, Haut und Nerven. Der Körper kann es zusätzlich aus der Aminosäure Tryptophan bilden." },
  { key: "b5", name: "Pantothensäure (B5)", unit: "mg", group: "vitamin", kind: "min", target: () => 5, src: "DGE",
    info: "Bestandteil von Coenzym A und damit am Abbau von Fetten, Kohlenhydraten und Proteinen beteiligt." },
  { key: "b6", name: "Vitamin B6", unit: "mg", group: "vitamin", kind: "min", target: (p) => (p.sex === "m" ? (p.age >= 65 ? 1.4 : 1.6) : 1.4), ul: 12, src: "DGE",
    info: "Zentral im Aminosäurestoffwechsel, für Nerven und Blutbildung." },
  { key: "folate", name: "Folat (B9)", unit: "µg", group: "vitamin", kind: "min", target: () => 300, src: "DGE",
    info: "Für Zellteilung und Blutbildung; besonders wichtig vor und in der Schwangerschaft. Viel in grünem Gemüse und Hülsenfrüchten (Name kommt von „folium“ = Blatt)." },
  { key: "b12", name: "Vitamin B12", unit: "µg", group: "vitamin", kind: "min", target: () => 4, src: "DGE",
    info: "Für Blutbildung und Nervensystem. Kommt praktisch nur in tierischen Lebensmitteln vor – bei veganer Ernährung unbedingt supplementieren." },
  { key: "choline", name: "Cholin", unit: "mg", group: "vitamin", kind: "min", target: () => 400, src: "EFSA",
    info: "Vitaminähnlicher Stoff für Zellmembranen, Leberfunktion und den Botenstoff Acetylcholin. Eier und Leber sind Spitzenquellen." },

  // Mineralstoffe & Spurenelemente
  { key: "ca", name: "Calcium", unit: "mg", group: "mineral", kind: "min", target: () => 1000, ul: 2500, src: "DGE",
    info: "Hauptbaustein von Knochen und Zähnen, nötig für Muskeln und Nerven. Quellen: Milchprodukte, Käse, grünes Gemüse, calciumreiches Mineralwasser." },
  { key: "p", name: "Phosphor", unit: "mg", group: "mineral", kind: "min", target: () => 700, src: "DGE",
    info: "Knochen, Zähne und Energiestoffwechsel (ATP). Mangel ist bei normaler Ernährung selten." },
  { key: "mg", name: "Magnesium", unit: "mg", group: "mineral", kind: "min", target: bySex(350, 300), src: "DGE",
    info: "Für Muskeln, Nerven, Herzrhythmus und über 300 Enzyme. Gute Quellen: Vollkorn, Nüsse, Kerne, Hülsenfrüchte." },
  { key: "k", name: "Kalium", unit: "mg", group: "mineral", kind: "min", target: () => 4000, src: "DGE",
    info: "Reguliert Wasserhaushalt, Blutdruck und Nervenreize. Viel Kalium (Gemüse, Obst, Hülsenfrüchte) wirkt Bluthochdruck entgegen." },
  { key: "fe", name: "Eisen", unit: "mg", group: "mineral", kind: "min", target: (p) => (p.sex === "m" ? 11 : p.menstruating ? 16 : 14), src: "DGE",
    info: "Für den Sauerstofftransport im Blut. Pflanzliches Eisen wird besser aufgenommen, wenn Vitamin C dabei ist; Kaffee und Tee zur Mahlzeit hemmen die Aufnahme." },
  { key: "zn", name: "Zink", unit: "mg", group: "mineral", kind: "min", target: bySex(14, 8), ul: 25, src: "DGE (mittlere Phytatzufuhr)",
    info: "Für Immunsystem, Wundheilung, Haut und Haare. Vollkorn und Hülsenfrüchte enthalten Phytat, das die Aufnahme etwas senkt." },
  { key: "cu", name: "Kupfer", unit: "mg", group: "mineral", kind: "min", target: bySex(1.6, 1.3), ul: 5, src: "EFSA",
    info: "Für Eisenstoffwechsel, Bindegewebe und Pigmentbildung. Quellen: Nüsse, Kakao, Vollkorn, Innereien." },
  { key: "mn", name: "Mangan", unit: "mg", group: "mineral", kind: "min", target: () => 3, src: "EFSA (DGE: 2–5 mg)",
    info: "Bestandteil antioxidativer Enzyme und wichtig für Knochen. Reichlich in Vollkorn, Haferflocken, Nüssen und Tee." },
  { key: "se", name: "Selen", unit: "µg", group: "mineral", kind: "min", target: bySex(70, 60), ul: 255, src: "DGE",
    info: "Schützt Zellen vor oxidativem Stress und ist wichtig für die Schilddrüse. Schon 1–2 Paranüsse decken den Tagesbedarf." },
  { key: "iod", name: "Iod", unit: "µg", group: "mineral", kind: "min", target: (p) => (p.age >= 51 ? 180 : 200), ul: 600, src: "DGE", estimated: true,
    info: "Baustein der Schilddrüsenhormone. Deutschland ist Iodmangelgebiet – wichtigste Quellen sind Jodsalz, Seefisch und Milchprodukte. Werte sind hier geschätzt, da Iod stark vom Salz und Futter abhängt." },

  // Fettsäuren
  { key: "la", name: "Linolsäure (Omega-6)", unit: "mg", group: "fett", kind: "min", target: (p, e) => ((e * 0.025) / 9) * 1000, src: "DGE (2,5 % der Energie)",
    info: "Essentielle Omega-6-Fettsäure. Wird in Deutschland meist reichlich aufgenommen (Sonnenblumenöl, Nüsse)." },
  { key: "ala", name: "Alpha-Linolensäure (Omega-3)", unit: "mg", group: "fett", kind: "min", target: (p, e) => ((e * 0.005) / 9) * 1000, src: "DGE (0,5 % der Energie)",
    info: "Essentielle pflanzliche Omega-3-Fettsäure. Quellen: Leinsamen/-öl, Rapsöl, Walnüsse, Chiasamen." },
  { key: "epadha", name: "EPA + DHA (Omega-3)", unit: "mg", group: "fett", kind: "min", target: () => 250, src: "EFSA",
    info: "Langkettige Omega-3-Fettsäuren für Herz, Gehirn und Augen. Fast nur in fettem Seefisch (Lachs, Hering, Makrele) oder Algenöl." },

  // Essentielle Aminosäuren (WHO/FAO/UNU 2007, mg je kg Körpergewicht)
  { key: "his", name: "Histidin", unit: "mg", group: "amino", kind: "min", target: (p) => 10 * p.weight, src: "WHO" },
  { key: "ile", name: "Isoleucin", unit: "mg", group: "amino", kind: "min", target: (p) => 20 * p.weight, src: "WHO" },
  { key: "leu", name: "Leucin", unit: "mg", group: "amino", kind: "min", target: (p) => 39 * p.weight, src: "WHO" },
  { key: "lys", name: "Lysin", unit: "mg", group: "amino", kind: "min", target: (p) => 30 * p.weight, src: "WHO",
    info: "Steckt reichlich in Hülsenfrüchten, Milch, Ei, Fisch und Fleisch; in Getreide eher knapp – deshalb ergänzen sich Getreide und Hülsenfrüchte gut." },
  { key: "metcys", name: "Methionin + Cystein", unit: "mg", group: "amino", kind: "min", target: (p) => 15 * p.weight, src: "WHO" },
  { key: "phetyr", name: "Phenylalanin + Tyrosin", unit: "mg", group: "amino", kind: "min", target: (p) => 25 * p.weight, src: "WHO" },
  { key: "thr", name: "Threonin", unit: "mg", group: "amino", kind: "min", target: (p) => 15 * p.weight, src: "WHO" },
  { key: "trp", name: "Tryptophan", unit: "mg", group: "amino", kind: "min", target: (p) => 4 * p.weight, src: "WHO" },
  { key: "val", name: "Valin", unit: "mg", group: "amino", kind: "min", target: (p) => 26 * p.weight, src: "WHO" },

  // Begrenzen
  { key: "salt", name: "Salz", unit: "g", group: "limit", kind: "max", target: () => 6, src: "DGE (höchstens 6 g)",
    info: "Berechnet aus dem Natriumgehalt. Viel Salz erhöht den Blutdruck; meist stammt es aus Brot, Käse, Wurst und Fertigprodukten." },
  { key: "satfat", name: "Gesättigte Fettsäuren", unit: "g", group: "limit", kind: "max", target: (p, e) => (e * 0.1) / 9, src: "DGE/WHO (< 10 % der Energie)",
    info: "Erhöhen das LDL-Cholesterin. Besser durch ungesättigte Fette aus Pflanzenölen, Nüssen und Fisch ersetzen." },
  { key: "trans", name: "Transfettsäuren", unit: "g", group: "limit", kind: "max", target: (p, e) => (e * 0.01) / 9, src: "WHO (< 1 % der Energie)",
    info: "Steigern das Herz-Kreislauf-Risiko deutlich. Kleine Mengen kommen natürlich in Milchfett und Rindfleisch vor." },
  { key: "sugar", name: "Zucker (gesamt)", unit: "g", group: "limit", kind: "info", target: (p, e) => (e * 0.1) / 4, src: "WHO: freier Zucker < 10 % der Energie",
    info: "Hier ist der gesamte Zucker inkl. Frucht- und Milchzucker aus Obst und Milch angegeben. Die WHO-Grenze gilt nur für zugesetzten Zucker, Honig und Säfte – der Balken ist daher nur eine grobe Orientierung." },
  { key: "chol", name: "Cholesterin", unit: "mg", group: "limit", kind: "info", target: () => 300, src: "Orientierung (keine offizielle Grenze mehr)",
    info: "Cholesterin aus der Nahrung beeinflusst den Blutspiegel bei den meisten Menschen nur wenig. Die DGE nennt keinen Grenzwert mehr." },
  { key: "caffeine", name: "Koffein", unit: "mg", group: "limit", kind: "max", target: () => 400, src: "EFSA (bis 400 mg unbedenklich)",
    info: "Bis 400 mg pro Tag (ca. 4 Tassen Filterkaffee) gelten für gesunde Erwachsene als unbedenklich, max. 200 mg auf einmal." },
  { key: "alcohol", name: "Alkohol", unit: "g", group: "limit", kind: "max", target: () => 0.0001, src: "DGE 2024: kein Alkohol empfohlen",
    info: "Es gibt keine gesundheitlich unbedenkliche Alkoholmenge. Die DGE empfiehlt seit 2024, auf Alkohol zu verzichten." },
];

export const GROUPS = {
  makro: "Energie & Makronährstoffe",
  vitamin: "Vitamine",
  mineral: "Mineralstoffe & Spurenelemente",
  fett: "Essentielle Fettsäuren",
  amino: "Essentielle Aminosäuren",
  limit: "Im Blick behalten",
};

// Nicht in der Datenbank erfasste essentielle Nährstoffe (keine verlässlichen Daten)
export const NOT_TRACKED = "Biotin, Chlorid, Fluorid, Chrom und Molybdän sind nicht erfasst, weil die Nährwertdatenbanken dafür kaum Werte enthalten. Ein Mangel ist bei gemischter Kost sehr selten.";

export function targetsFor(profile) {
  const e = energyTarget(profile);
  const t = {};
  for (const n of NUTRIENTS) t[n.key] = n.target(profile, e);
  return t;
}

// Sekundäre Pflanzenstoffe & bioaktive Stoffe – nur solche mit solider Studienlage.
// mode "amount": Menge aus der Datenbank, "grams": Gramm Lebensmittel mit passendem Tag.
export const PHYTO = [
  {
    key: "betaGlucan", name: "Beta-Glucan aus Hafer & Gerste", unit: "g", mode: "amount", goal: 3,
    evidence: "EFSA-anerkannt", level: 3,
    good: "Löslicher Ballaststoff, der im Darm ein Gel bildet. Von der EFSA anerkannt: 3 g täglich senken das LDL-Cholesterin und dämpfen den Blutzuckeranstieg nach dem Essen.",
    sources: "Haferflocken, Haferkleie, Gerste/Graupen",
  },
  {
    key: "lutein", name: "Lutein & Zeaxanthin", unit: "mg", scale: 0.001, mode: "amount", goal: 10, goalNote: "in Studien verwendete Menge",
    evidence: "gut belegt", level: 2,
    good: "Carotinoide, die sich im gelben Fleck der Netzhaut anreichern und blaues Licht filtern. Eine hohe Zufuhr ist mit einem geringeren Risiko für altersbedingte Makuladegeneration verbunden (u. a. AREDS2-Studie).",
    sources: "Grünkohl, Spinat, Mangold, Brokkoli, Erbsen, Eigelb",
  },
  {
    key: "betaCarotene", name: "Beta-Carotin", unit: "mg", scale: 0.001, mode: "amount", goal: 3, goalNote: "DGE-Schätzwert 2–4 mg",
    evidence: "gut belegt (aus Lebensmitteln)", level: 2,
    good: "Wird bei Bedarf zu Vitamin A umgewandelt und wirkt antioxidativ. Aus Obst und Gemüse mit weniger Herz-Kreislauf-Erkrankungen verbunden. Achtung: Das gilt nur für Lebensmittel – hochdosierte Präparate erhöhten bei Rauchern das Lungenkrebsrisiko.",
    sources: "Karotten, Süßkartoffel, Kürbis, Grünkohl, Spinat, Mango",
  },
  {
    key: "lycopene", name: "Lycopin", unit: "mg", scale: 0.001, mode: "amount", goal: 10, goalNote: "Orientierung aus Studien",
    evidence: "moderat belegt", level: 1,
    good: "Rotes Carotinoid mit starker antioxidativer Wirkung. In Beobachtungsstudien mit geringerem Risiko für Herz-Kreislauf-Erkrankungen und Prostatakrebs verbunden. Aus erhitzten Tomaten (Sauce, Mark) mit etwas Öl wird es am besten aufgenommen.",
    sources: "Tomatenmark, passierte Tomaten, Tomaten, Wassermelone, Grapefruit (rosa)",
  },
  {
    key: "flavTotal", name: "Flavonoide (gesamt)", unit: "mg", mode: "amount", goal: 500, goalNote: "Plateau in großen Kohortenstudien",
    evidence: "moderat belegt", level: 1,
    good: "Größte Gruppe der Polyphenole. In großen Beobachtungsstudien ist eine Zufuhr um 500 mg pro Tag mit geringerer Sterblichkeit an Herz-Kreislauf-Erkrankungen und Krebs verbunden – darüber steigt der Nutzen kaum noch.",
    sources: "Tee, Äpfel, Beeren, Zwiebeln, Orangen, Kakao, Rotkohl",
    sub: [
      { key: "flavan3ols", name: "Flavan-3-ole", good: "Tee, Kakao, Äpfel. Kakao-Flavanole sind EFSA-anerkannt: Sie unterstützen die Elastizität der Blutgefäße." },
      { key: "anthocyanins", name: "Anthocyane", good: "Blaue/rote Farbstoffe aus Beeren, Kirschen, Rotkohl. Mit geringerem Herzinfarktrisiko und besserem Blutdruck verbunden." },
      { key: "flavonols", name: "Flavonole", good: "Quercetin & Co. aus Zwiebeln, Grünkohl, Äpfeln, Tee. Entzündungshemmend, in Studien leicht blutdrucksenkend." },
      { key: "flavanones", name: "Flavanone", good: "Hesperidin aus Orangen und Zitrusfrüchten. Mit besserer Gefäßfunktion verbunden." },
      { key: "flavones", name: "Flavone", good: "Apigenin und Luteolin aus Petersilie, Sellerie und Paprika." },
    ],
  },
  {
    key: "kreuz", name: "Glucosinolate (Kreuzblütler)", unit: "g", mode: "grams", weekly: true,
    goalNote: "Orientierung: mehrere Portionen (à 100 g) pro Woche",
    evidence: "moderat belegt", level: 1,
    good: "Beim Kauen und Schneiden entstehen daraus Isothiocyanate wie Sulforaphan. Regelmäßiger Verzehr von Kohlgemüse ist in Studien mit geringerem Risiko für einige Krebsarten und Herz-Kreislauf-Erkrankungen verbunden. Tipp: roh oder nur kurz garen – Senf oder Rucola dazu erhöhen die Wirkstoffbildung.",
    sources: "Brokkoli, Grünkohl, Rosenkohl, Kohlrabi, Rucola, Radieschen, Kresse",
  },
  {
    key: "allium", name: "Schwefelverbindungen (Lauchgewächse)", unit: "g", mode: "grams", weekly: true,
    goalNote: "Orientierung: täglich etwas Zwiebel oder Knoblauch",
    evidence: "moderat belegt", level: 1,
    good: "Knoblauch und Zwiebeln liefern Schwefelverbindungen wie Allicin. Meta-Analysen zeigen bei regelmäßigem Knoblauchverzehr eine leichte Senkung von Blutdruck und Cholesterin.",
    sources: "Knoblauch, Zwiebeln, Lauch, Schnittlauch, Frühlingszwiebeln",
  },
];

export const PHYTO_EXCLUDED = "Bewusst nicht aufgenommen, weil die Studienlage beim Menschen zu unsicher oder widersprüchlich ist: Resveratrol, Curcumin, Isoflavone, Phytosterine (Nutzen nur in angereicherten Mengen belegt) und Zahlenwerte wie ORAC.";

export const MEALS = [
  { key: "fruehstueck", name: "Frühstück" },
  { key: "mittag", name: "Mittagessen" },
  { key: "abend", name: "Abendessen" },
  { key: "snack", name: "Snacks & Getränke" },
];

// Nahrungsergänzung landet unabhängig von der Uhrzeit in einer eigenen Gruppe
export const SUPPLEMENT_MEAL = { key: "ergaenzung", name: "Nahrungsergänzung" };

export function mealForHour(h) {
  if (h >= 4 && h < 11) return "fruehstueck";
  if (h >= 11 && h < 15) return "mittag";
  if (h >= 17.5 && h < 23) return "abend";
  return "snack";
}

export const DEFAULT_PROFILE = { sex: "m", age: 35, weight: 75, height: 178, pal: 1.6, menstruating: true, kcalOverride: 0 };
