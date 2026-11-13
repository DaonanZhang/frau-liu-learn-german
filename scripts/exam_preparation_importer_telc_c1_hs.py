#!/usr/bin/env python3
"""Import the TELC C1 Hochschule workbooks into their isolated import trees."""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

import pandas as pd
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))
import exam_preparation_importer as shared

from apps.exam_preparation.models import (
    ExerciseBase, ListeningExercise, ListeningQuestion, ListeningAnswerOption,
    ReadingAdMatchingExercise, ReadingAdMatchingAd, ReadingAdMatchingItem,
    WritingExercise, SpeakingTeilExercise,
    ClozeMatchingExercise, ClozeMatchingOption, ClozeMatchingBlankAnswer,
)
from apps.exam_preparation.models import WritingExampleText
from apps.exam_preparation.speaking_audio import speaking_turn_audio_url

RAW_ROOT = ROOT / "apps/exam_preparation/data/imports/telc/c1_hs"
DEFAULT_SOURCE = ROOT / "tmp/c1hs-drive"
KINDS = {
    "reading_teil1": ("reading_teil1", None),
    "reading_teil2": ("reading_teil2", None),
    "reading_teil3": ("reading_teil3", shared.import_reading_understanding),
    "cloze_choice": ("cloze_choice", shared.import_cloze_choice),
    "listening_teil1": ("listening_teil1", None),
    "listening_teil2": ("listening_teil2", None),
    "listening_teil3": ("listening_teil3", None),
    "writing": ("writing", None),
    "speaking_teil1": ("speaking_teil1", None),
    "speaking_teil2": ("speaking_teil2", None),
}
SEED_PROVENANCE = {
    "type": "official_practice_test_pdf",
    "note": "Task formats and themes come from official TELC C1 Hochschule practice-test details supplied for this project; German examples and Chinese translations are locally authored. No Drive workbook is claimed as the source.",
}
WRITING_SEEDS = [
    {"external_id": "seed-writing-literatur", "title": "Literatur und Gesellschaft",
     "instruction": "Wählen Sie eines der beiden Zitate. Verfassen Sie einen zusammenhängenden Text mit mindestens 350 Wörtern. Begründen Sie Ihre Position und beziehen Sie Beispiele ein.",
     "quotes": [{"text": "Literatur hat nie etwas Negatives verhindern können.", "translation_zh": "文学从未能阻止任何负面的事情发生。"}, {"text": "Literatur bietet mehr Orientierung als alles andere.", "translation_zh": "文学比其他任何事物都更能为人指引方向。"}],
     "outline": ["Funktion von Literatur bestimmen", "Argumente beider Zitate abwägen", "Beispiele aus Gesellschaft und eigener Lektüre einordnen", "begründete Schlussposition formulieren"],
     "sample_de": "Literatur kann gesellschaftliche Entwicklungen nicht nach Belieben aufhalten. Dennoch wäre es zu kurz gegriffen, ihren Einfluss deshalb für bedeutungslos zu halten. Bücher verändern politische Entscheidungen selten unmittelbar, prägen aber, welche Fragen eine Gesellschaft stellt.\n\nDas erste Zitat erinnert daran, dass Romane Kriege, Ausgrenzung oder Krisen nicht verhindern. Wer Literatur eine direkte Schutzwirkung zuschreibt, überschätzt ihre Möglichkeiten. Für konkrete Veränderungen braucht es politische Institutionen, rechtliche Regeln und Menschen, die Verantwortung übernehmen.\n\nGleichzeitig kann Literatur Erfahrungen sichtbar machen, die im öffentlichen Diskurs wenig Raum erhalten. Ein Roman ermöglicht, die Folgen einer Entscheidung aus verschiedenen Perspektiven zu betrachten. Leserinnen und Leser begegnen Lebenswelten, die ihnen sonst fremd blieben. Das liefert keine fertige Handlungsanweisung, kann jedoch Vorurteile irritieren und die Bereitschaft fördern, genauer hinzusehen.\n\nDas zweite Zitat formuliert eine wichtige, aber zu weitreichende Behauptung. Literatur bietet Orientierung, doch sie ist nicht die einzige Quelle. Wissenschaftliche Erkenntnisse, persönliche Beziehungen und demokratische Debatten sind ebenfalls notwendig. Zudem vertreten Bücher widersprüchliche Weltbilder. Gerade diese Vielfalt zwingt dazu, Aussagen zu prüfen, statt sie ungefragt zu übernehmen.\n\nEntscheidend ist daher nicht, ob Literatur jedes Übel verhindert oder stets die beste Orientierung gibt. Ihre Stärke liegt darin, Erfahrungen zu vermitteln und komplexe Zusammenhänge vorstellbar zu machen. Sie ersetzt weder politisches Handeln noch sachliche Information, kann aber dazu beitragen, Folgen bewusster zu beurteilen. In diesem begrenzten, wichtigen Sinn wirkt Literatur gesellschaftlich: als Anstoß zu Urteil und Verantwortung.\n\nDabei sollte man auch berücksichtigen, dass Texte nicht in einem gesellschaftlichen Vakuum entstehen. Sie werden verlegt, besprochen, in Schulen ausgewählt und von unterschiedlichen Lesergruppen verschieden verstanden. Ein Werk kann zunächst kaum Beachtung finden und erst später als wichtig gelten. Seine Wirkung hängt daher nicht nur vom Inhalt ab, sondern auch davon, ob Menschen Zugang dazu haben und Gelegenheit erhalten, über Gelesenes zu sprechen. Bibliotheken, Übersetzungen und Literaturunterricht sind in dieser Hinsicht bedeutsam. Sie machen Werke verfügbar und eröffnen einen gemeinsamen Gesprächsraum.\n\nGleichzeitig darf man von Schriftstellerinnen und Schriftstellern keine moralische Unfehlbarkeit erwarten. Literarische Qualität ist kein Beweis dafür, dass ein Text eine richtige politische oder ethische Antwort bereithält. Gerade deshalb ist kritische Lektüre wichtig. Man kann die Perspektive einer Figur nachvollziehen, ohne ihr Verhalten gutzuheißen; man kann sich von einer Erzählung berühren lassen und ihre Darstellung dennoch hinterfragen. Eine solche Haltung verbindet Offenheit mit Urteilskraft.\n\nLiteratur liefert selten klare Regeln, erweitert aber die Wahrnehmung. Sie kann Menschen für Folgen, Widersprüche und fremde Erfahrungen sensibilisieren. Ob daraus Veränderung entsteht, hängt davon ab, was Leserinnen und Leser mit dieser Erfahrung anfangen. Literatur verhindert negative Entwicklungen nicht automatisch; sie kann jedoch dazu beitragen, Probleme genauer zu erkennen und verantwortlicher über Antworten nachzudenken."},
    {"external_id": "seed-writing-gruppenarbeit", "title": "Gruppenarbeit an Hochschulen",
     "instruction": "Wählen Sie eines der beiden Zitate. Verfassen Sie einen zusammenhängenden Text mit mindestens 350 Wörtern. Begründen Sie Ihre Position und beziehen Sie Beispiele ein.",
     "quotes": [{"text": "Gruppenarbeit kostet doch nur Zeit, weil man alles ausdiskutieren muss.", "translation_zh": "小组合作只会浪费时间，因为什么事都得拿出来讨论。"}, {"text": "Teamarbeit bietet dem Einzelnen viel mehr Möglichkeiten.", "translation_zh": "团队合作为个人提供了更多可能性。"}],
     "outline": ["Arbeitsformen an Hochschulen unterscheiden", "Abstimmungsaufwand und Lerngewinn abwägen", "Beispiele und Gegenargumente prüfen", "Bedingungen gelingender Zusammenarbeit benennen"],
     "sample_de": "Ob Gruppenarbeit an der Hochschule Zeit kostet oder zusätzliche Möglichkeiten eröffnet, hängt stark von ihrer Organisation ab. Beide Zitate beschreiben reale Erfahrungen, verallgemeinern sie jedoch. Eine sachliche Bewertung muss berücksichtigen, welche Aufgabe bearbeitet wird und wie die Gruppe zusammenarbeitet.\n\nDer Einwand ist nachvollziehbar: Sind Zuständigkeiten unklar, wird lange über Details diskutiert, während die eigentliche Arbeit liegen bleibt. Auch unterscheiden sich Arbeitsgeschwindigkeiten. Einzelne übernehmen mitunter den größten Teil, andere beteiligen sich kaum. Unter solchen Bedingungen erscheint eine individuelle Aufgabe effizienter und gerechter.\n\nAllerdings ist Abstimmung nicht automatisch verlorene Zeit. Bei komplexen Fragestellungen kann ein Perspektivwechsel Fehler aufdecken und zu besseren Ergebnissen führen. Studierende lernen, Argumente verständlich zu erklären, Kritik aufzunehmen und Entscheidungen gemeinsam zu vertreten. Diese Fähigkeiten sind auch im Berufsleben gefragt.\n\nDamit die Vorteile entstehen, braucht es einen klaren Rahmen: ein gemeinsames Ziel, nachvollziehbare Teilaufgaben und eine transparente Bewertung individueller Beiträge. Sinnvoll ist außerdem, früh einen Zeitplan zu vereinbaren und abschließend zu prüfen, ob alle Ergebnisse zusammenpassen. Die Lehrperson sollte erreichbar sein, ohne jede Entscheidung abzunehmen.\n\nNicht jede Aufgabe eignet sich gleich gut für Teamarbeit. Eine kurze Wissensabfrage lässt sich allein schneller bearbeiten; bei einer umfangreichen Recherche kann Zusammenarbeit neue Einsichten ermöglichen. Gruppenarbeit ist deshalb weder die Pflichtlösung für jedes Problem noch bloßer Zeitverlust.\n\nInsgesamt eröffnet Teamarbeit zusätzliche Lerngelegenheiten, verlangt aber mehr Planung. Ihr Nutzen entsteht nicht von selbst. Wenn Aufgaben klar verteilt und Leistungen fair sichtbar gemacht werden, überwiegen bei anspruchsvollen Projekten die Vorteile. Wo diese Voraussetzungen fehlen, ist die Kritik des ersten Zitats berechtigt.\n\nEin weiterer Vorteil liegt darin, dass fachliche Unterschiede produktiv werden können. In einer Gruppe bringen Studierende verschiedene Kenntnisse und Arbeitsweisen mit. Eine Person findet vielleicht relevante Quellen, eine andere kann Ergebnisse statistisch prüfen, während ein drittes Mitglied die Argumentation sprachlich präzisiert. Das Resultat kann dadurch umfassender werden als eine Einzelarbeit. Voraussetzung ist allerdings, dass Beiträge nicht nur nebeneinanderstehen, sondern gemeinsam ausgewertet werden.\n\nAuch die soziale Seite des Lernens ist bedeutsam. Wer eine Idee vor anderen erläutert, muss sie strukturieren und auf Rückfragen reagieren. Das hilft, Lücken im eigenen Verständnis zu erkennen. Zugleich verlangt Kooperation die Fähigkeit, Kritik sachlich anzunehmen und bei Meinungsverschiedenheiten Kompromisse zu entwickeln. Diese Erfahrung ist besonders wertvoll, wenn alle Beteiligten tatsächlich Verantwortung tragen.\n\nDie Bewertung sollte daher sowohl das gemeinsame Ergebnis als auch den individuellen Anteil sichtbar machen. Kurze Zwischenberichte, dokumentierte Aufgabenverteilung oder eine abschließende Reflexion können verhindern, dass ungleiche Beteiligung unbemerkt bleibt. So wird Gruppenarbeit planbarer und gerechter. Sie kostet Abstimmungszeit, aber diese Zeit ist sinnvoll investiert, wenn die Aufgabe Austausch verlangt und die Organisation klare Verantwortlichkeiten schafft."},
]
SPEAKING_SEEDS = [
    {"external_id": "seed-speaking-teil1a", "title": "Präsentation", "teil": "1A", "time_limit_minutes": 3,
     "instruction": "Wählen Sie ein Thema, präsentieren Sie Ihre Überlegungen und begründen Sie Ihre Position.",
     "topics": [{"de": "Vor- und Nachteile einer wichtigen Erfindung", "zh": "一项重要发明的利与弊"}, {"de": "Das Hochschulsystem eines Landes", "zh": "某个国家的高校体系"}, {"de": "Ein Erlebnis, das meine Studien- oder Berufswahl beeinflusst hat", "zh": "影响我学业或职业选择的一段经历"}, {"de": "Kunstunterricht in der Schule", "zh": "学校里的艺术课程"}, {"de": "Fremdsprachenunterricht in interkulturellen Gruppen", "zh": "跨文化课堂中的外语教学"}, {"de": "Die Bedeutung von Natur- und Geisteswissenschaften", "zh": "自然科学与人文科学的重要性"}],
     "outline": ["Thema eingrenzen und Relevanz erklären", "zwei Aspekte mit Beispielen darstellen", "einen Einwand berücksichtigen", "Position zusammenfassen"],
     "sample_de": "Ich möchte über die Bedeutung von Natur- und Geisteswissenschaften sprechen. Die Frage, welche Wissenschaft wichtiger ist, führt meiner Ansicht nach in die Irre, denn beide Bereiche eröffnen unterschiedliche, notwendige Perspektiven. Naturwissenschaftliche Forschung hilft, Vorgänge in Umwelt und Körper zu verstehen. Sie liefert Grundlagen für medizinische Verfahren und klimafreundliche Technologien. Ohne überprüfbare Daten wären viele Entscheidungen Vermutungen.\n\nGeisteswissenschaften untersuchen Sprache, Geschichte, Kultur und Zusammenleben. Sie erklären, warum eine technische Neuerung in Gesellschaften verschieden bewertet wird, und stellen Fragen nach Verantwortung und Gerechtigkeit. Beide Perspektiven sind wichtig, wenn Forschung praktisch angewendet wird: Eine digitale Technik kann effizient sein, zugleich aber Privatsphäre und Chancengleichheit beeinflussen. Technik allein beantwortet diese Fragen nicht; ethische Überlegungen wiederum brauchen Kenntnis der tatsächlichen Möglichkeiten.\n\nEine fachliche Spezialisierung bleibt notwendig. Dennoch sollten Hochschulen Austausch ermöglichen. Naturwissenschaftliche Arbeit gewinnt durch gesellschaftlichen Kontext; geisteswissenschaftliche Forschung sollte empirische Methoden ernst nehmen. Natur- und Geisteswissenschaften sind keine Konkurrenten, sondern ergänzen einander.\n\nDas lässt sich am Beispiel medizinischer Innovationen verdeutlichen. Ein neues Diagnoseverfahren kann Erkrankungen früher erkennen und damit Behandlungschancen verbessern. Um es verantwortungsvoll einzusetzen, müssen jedoch auch Fragen des Datenschutzes, der Kostenverteilung und des Zugangs geklärt werden. Wer entscheidet, welche Patientengruppen zuerst davon profitieren? Und wie geht man mit Unsicherheiten um, wenn ein Verfahren zwar statistisch zuverlässig, im Einzelfall aber nicht unfehlbar ist? Solche Fragen verlangen sowohl genaue Forschungsergebnisse als auch historische, ethische und gesellschaftliche Einordnung.\n\nAuch im Studium sollte diese Ergänzung sichtbar werden. Gemeinsame Seminare können Studierende dazu anregen, ihre Fachbegriffe zu erklären und die Grenzen der eigenen Methoden zu erkennen. Das kostet Zeit und lässt sich nicht in jedem Modul verwirklichen. Dennoch wäre es sinnvoll, an ausgewählten Projekten zusammenzuarbeiten, etwa bei einer Untersuchung zur Energiewende. Naturwissenschaftliche Daten könnten zeigen, welche Technologien funktionieren; sozialwissenschaftliche und historische Analysen würden erklären, welche Interessen und Erfahrungen die Umsetzung beeinflussen.\n\nZusammenfassend erfüllen beide Wissenschaftsbereiche unterschiedliche Aufgaben. Naturwissenschaften untersuchen, was möglich ist und unter welchen Bedingungen. Geisteswissenschaften helfen zu fragen, was wünschenswert und für wen gerecht ist. Keine Perspektive kann die andere ersetzen. Hochschulen sollten daher fachliche Tiefe fördern und zugleich Begegnungen ermöglichen, damit wissenschaftlicher Fortschritt nicht nur technisch überzeugend, sondern auch gesellschaftlich verantwortbar ist.",
     "sample_zh": "我想谈谈自然科学与人文科学的重要性。哪类科学更重要，这种提问容易造成误解，因为两者提供不同且必要的视角。自然科学帮助我们理解自然环境和人体，为医疗方法及环保技术提供依据。人文科学则研究语言、历史、文化和社会生活，能够讨论技术创新在不同社会中为何受到不同评价，并提出责任与公平等问题。比如新的数字技术可能提高效率，却同时影响隐私和机会平等。医疗诊断技术也需要结合科学证据与伦理、社会分析，才能负责任地应用。高校可以通过跨学科研讨和项目，让学生解释各自的方法并认识其局限。自然科学研究可以说明哪些技术可行，人文及社会研究则帮助分析实施过程中涉及的利益和经验。总之，自然科学关注什么能够实现，人文科学帮助我们思考什么值得实现、对谁公平。两者相互补充，高校应兼顾专业深度与跨学科交流。"},
    {"external_id": "seed-speaking-teil1b", "title": "Zusammenfassen und nachfragen", "teil": "1B", "time_limit_minutes": 2,
     "instruction": "Fassen Sie den Beitrag Ihres Gegenübers zusammen und stellen Sie eine vertiefende Rückfrage.",
     "outline": ["Kernaussage neutral wiedergeben", "zwei Gründe auswählen", "Beispiel oder Einschränkung aufnehmen", "offene Rückfrage stellen"],
     "sample_de": "Wenn ich Sie richtig verstanden habe, sehen Sie Natur- und Geisteswissenschaften als sich ergänzende Bereiche. Sie haben betont, dass naturwissenschaftliche Erkenntnisse praktische Lösungen ermöglichen, während die Geisteswissenschaften deren Folgen und ethische Grenzen untersuchen. Das Beispiel digitaler Technik zeigt, dass Effizienz allein keine ausreichende Bewertung erlaubt. Habe ich Ihren Standpunkt korrekt zusammengefasst? Mich würde interessieren: Wie könnte eine Hochschule Studierende verschiedener Fachrichtungen bereits im Bachelor stärker zusammenarbeiten lassen?\n\nAußerdem habe ich Ihren Hinweis so verstanden, dass interdisziplinäre Arbeit nicht bedeutet, die fachliche Spezialisierung aufzugeben. Vielmehr sollen unterschiedliche Methoden zusammenkommen, wenn eine Fragestellung mehrere Perspektiven erfordert. Das erscheint mir überzeugend, weil Zusammenarbeit nur dann einen Mehrwert bietet, wenn die jeweiligen Beiträge klar erkennbar sind. Sonst besteht die Gefahr, dass ein Projekt zwar viele Themen berührt, aber keines gründlich behandelt.\n\nWürden Sie deshalb eher einzelne gemeinsame Projektseminare empfehlen oder sollte ein solcher Austausch fest in jedem Studiengang verankert sein? Und wie ließe sich sicherstellen, dass die zusätzliche Zusammenarbeit nicht zu einer zu großen Belastung für Studierende und Lehrende wird?",
     "sample_zh": "如果我理解正确，您认为自然科学与人文科学能够相互补充。您强调，自然科学知识可以带来实际解决方案，而人文科学研究其社会影响和伦理边界。数字技术的例子说明，效率本身不足以构成完整评价。我的概括准确吗？我还想请教：高校可以怎样让本科阶段不同专业的学生开展更多合作？"},
    {"external_id": "seed-speaking-teil2", "title": "Diskussion", "teil": "2", "time_limit_minutes": 6,
     "instruction": "Diskutieren Sie die Aussage, begründen Sie Ihre Meinung, reagieren Sie auf Gegenargumente und suchen Sie eine differenzierte Schlussfolgerung.",
     "quotes": [{"text": "Die beste Bildung findet ein kluger Mensch auf Reisen.", "author": "Goethe", "translation_zh": "聪明人能在旅行中获得最好的教育。"}, {"text": "Am Mut hängt der Erfolg.", "author": "Fontane", "translation_zh": "成功取决于勇气。"}, {"text": "Auf Kinder wirkt das Vorbild, nicht die Kritik.", "author": "Thiersch", "translation_zh": "对孩子产生影响的是榜样，而非批评。"}],
     "outline": ["Aussage auslegen und Position beziehen", "Argumente und Beispiele austauschen", "Gegenargumente abwägen", "Schlussfolgerung formulieren"],
     "dialogue": [{"sequence": 1, "role": "TN1", "text": "Ich würde mit Goethes Aussage beginnen. Reisen können Bildung erweitern, weil man andere Lebensweisen unmittelbar erlebt. Der Lerneffekt hängt jedoch davon ab, ob man sich auf Begegnungen einlässt. Wer nur bekannte Sehenswürdigkeiten besucht, lernt möglicherweise wenig über den Alltag der Menschen vor Ort."}, {"sequence": 2, "role": "TN2", "text": "Das sehe ich ähnlich, aber ich würde die Aussage nicht wörtlich nehmen. Bildung entsteht auch durch Unterricht, Bücher und Gespräche. Reisen sind zudem nicht für alle bezahlbar. Deshalb sollte man nicht den Eindruck erwecken, ein längerer Auslandsaufenthalt sei die Voraussetzung für eine gute Ausbildung."}, {"sequence": 3, "role": "TN1", "text": "Das ist ein wichtiger Einwand. Vielleicht sollte man zwischen einem Ortswechsel und interkultureller Erfahrung unterscheiden. Auch Austauschprojekte, Gastfamilien oder internationale Arbeitsgruppen können den eigenen Blick verändern. Entscheidend ist, dass man sich mit einer anderen Perspektive ernsthaft auseinandersetzt."}, {"sequence": 4, "role": "TN2", "text": "Entscheidend ist wohl die Begegnung. Gleichzeitig braucht man Vorbereitung und die Bereitschaft, eigene Maßstäbe zu hinterfragen. Sonst bestätigt man lediglich seine Vorurteile. Außerdem können kurze Begegnungen komplexe Lebensverhältnisse vereinfachen, wenn man sie vorschnell verallgemeinert."}, {"sequence": 5, "role": "TN1", "text": "Dann könnten wir festhalten: Reisen sind eine wertvolle Bildungsform, aber keine Garantie für Bildung. Sie ergänzen andere Lernwege und wirken besonders, wenn Erlebnisse reflektiert werden. Vielleicht sollte eine Hochschule deshalb nicht nur Mobilität finanzieren, sondern Studierende auch vor und nach dem Aufenthalt begleiten."}, {"sequence": 6, "role": "TN2", "text": "Ja, eine Vorbereitung könnte Informationen über Geschichte, Sprache und soziale Unterschiede vermitteln. Danach sollten Teilnehmende diskutieren, welche Erwartungen sich bestätigt haben und welche nicht. Das würde verhindern, dass eine Reise bloß als Lebenslaufstation erscheint, und den tatsächlichen Lernprozess stärker machen."}, {"sequence": 7, "role": "TN1", "text": "Ein weiterer Punkt ist die Frage, wer überhaupt reisen kann. Stipendien und flexible Studienplanung könnten Hindernisse verringern. Zugleich sollten Hochschulen gleichwertige lokale Angebote schaffen, beispielsweise internationale Projektgruppen. So wäre interkulturelles Lernen nicht ausschließlich an finanzielle Möglichkeiten gebunden."}, {"sequence": 8, "role": "TN2", "text": "Damit verbinden wir beide Seiten der Aussage: Reisen können eine intensive Erfahrung sein, aber Bildung entsteht erst durch Aufmerksamkeit, Austausch und Reflexion. Wir könnten also sagen, dass kluge Menschen auf Reisen lernen können, während gute Bildung auch andere Zugänge braucht."}],
     "dialogue_zh": [{"sequence": 1, "role": "TN1", "text": "我想从歌德这句话谈起。旅行能拓展教育，因为人们可以直接体验其他生活方式。不过，学习效果取决于是否愿意交流。"}, {"sequence": 2, "role": "TN2", "text": "我也这么认为，但不应按字面完全理解。教育也来自课堂、书籍和交流，而且旅行费用并非人人负担得起。"}, {"sequence": 3, "role": "TN1", "text": "这是个重要的反面意见。也许应区分地理旅行和跨文化体验。交换项目同样能改变视角。"}, {"sequence": 4, "role": "TN2", "text": "关键在于交流。同时也需提前准备，并愿意反思自己的标准，否则旅行可能只是进一步确认偏见。"}, {"sequence": 5, "role": "TN1", "text": "我们可以认为，旅行是一种有价值的教育形式，但并不保证教育一定发生。它能补充其他学习方式，尤其在经历之后进行反思时。"}]},
]


def kind_for(path: Path) -> str:
    for kind in KINDS:
        if path.name.lower().startswith(kind + "__"):
            return kind
    match = re.search(r"_(Schreiben|Vortrag|Zitat)_\d+$", path.stem, re.IGNORECASE)
    if match:
        return {"schreiben": "writing", "vortrag": "speaking_teil1", "zitat": "speaking_teil2"}[match.group(1).casefold()]
    raise shared.ImportErrorWithContext(f"{path.name}: unknown C1 Hochschule workbook kind")


def workbook_meta(path: Path) -> tuple[dict, pd.DataFrame]:
    book = pd.ExcelFile(path, engine="openpyxl")
    meta = book.parse("meta")
    nonempty = meta[meta.apply(lambda row: any(shared.clean_text(v) for v in row), axis=1)]
    shared.require_one_exercise_per_file(path, len(nonempty))
    row = {key: shared.clean_text(value) for key, value in nonempty.iloc[0].to_dict().items()}
    exam_key = "考试类型" if "考试类型" in row else "考试类型 "
    if not row.get(exam_key):
        raise shared.ImportErrorWithContext(f"{path.name}: missing required exam type in meta!{exam_key}")
    if row[exam_key].strip().upper() != "TELC":
        raise shared.ImportErrorWithContext(f"{path.name}: expected exam type TELC, got {row[exam_key]!r}")
    return row, meta


def external_id(path: Path, row: dict) -> str:
    candidates = [row.get("ID"), row.get("音频文件_ID")]
    value = next((shared.clean_text(item) for item in candidates if shared.clean_text(item)), "")
    if not value:
        value = path.stem.rsplit("_", 1)[-1]
        if not value.isdigit():
            raise shared.ImportErrorWithContext(f"{path.name}: missing workbook exercise ID and numeric filename suffix")
    filename_id = re.search(r"_(\d+)$", path.stem)
    if filename_id and _numeric_id(value) != _numeric_id(filename_id.group(1)):
        raise shared.ImportErrorWithContext(f"{path.name}: workbook ID does not match numeric filename suffix")
    return shared.external_id_from_filename(path, value)


def preflight(paths: list[Path]) -> list[str]:
    issues, seen = [], {}
    for path in paths:
        try:
            kind = kind_for(path)
            row, _ = workbook_meta(path)
            identifier = external_id(path, row)
            exercise_type = {
                "reading_teil1": "CLOZE_MATCHING", "reading_teil2": "READING_AD_MATCHING",
                "reading_teil3": "READING_UNDERSTANDING", "cloze_choice": "CLOZE_CHOICE",
                "listening_teil1": "LISTENING_TEIL1", "listening_teil2": "LISTENING_TEIL2",
                "listening_teil3": "LISTENING_TEIL3",
                "writing": "WRITING_PROMPT", "speaking_teil1": "SPEAKING_TEIL1",
                "speaking_teil2": "SPEAKING_TEIL3",
            }[kind]
            keys = [("TELC", "C1", exercise_type, identifier)]
            if kind == "speaking_teil1":
                keys.append(("TELC", "C1", "SPEAKING_TEIL2", identifier))
            for key in keys:
                if key in seen:
                    raise shared.ImportErrorWithContext(f"duplicate batch key {key}; first seen in {seen[key].name}")
            if kind == "reading_teil1":
                _validate_reading_teil1_structure(path)
            if kind == "reading_teil2":
                _validate_reading_teil2_structure(path)
            if kind in {"writing", "speaking_teil1", "speaking_teil2"}:
                _validate_c1_sample(path, kind, identifier)
            for key in keys:
                seen[key] = path
        except Exception as exc:  # noqa: BLE001
            issues.append(f"{path.name}: {exc}")
    return issues


def _normalized_copy(path: Path, kind: str) -> Path:
    sheets = pd.read_excel(path, sheet_name=None, engine="openpyxl")
    meta = sheets["meta"]
    exam_column = "考试类型" if "考试类型" in meta.columns else "考试类型 "
    if exam_column not in meta.columns:
        raise shared.ImportErrorWithContext(f"{path.name}: meta sheet has no 考试类型 column")
    # Enforce the source value before normalizing spelling/case for the shared importer.
    if not meta[exam_column].map(shared.clean_text).map(bool).all():
        raise shared.ImportErrorWithContext(f"{path.name}: missing required exam type in meta!{exam_column}")
    meta[exam_column] = "TELC"
    if kind in {"reading_teil1", "cloze_choice"}:
        meta["原题"] = ""
    if kind == "cloze_choice" and "is_correct" in sheets["exercise"].columns:
        sheets["exercise"]["is_correct"] = sheets["exercise"]["is_correct"].map(
            lambda value: {
                "richtig": True,
                "falsch": False,
            }.get(shared.clean_text(value).casefold(), value)
        )
    name = f"c1_{path.name.split('__', 1)[-1]}"
    folder = ROOT / "tmp/c1hs-normalized-import"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / name
    with pd.ExcelWriter(target, engine="openpyxl") as writer:
        for sheet, frame in sheets.items():
            frame.to_excel(writer, sheet_name=sheet, index=False)
    return target


def import_workbook(path: Path, generate_speaking_audio: bool = False) -> int:
    kind = kind_for(path)
    row, _ = workbook_meta(path)
    identifier = external_id(path, row)
    if kind == "reading_teil1":
        return import_reading_teil1(path, row, identifier)
    if kind == "reading_teil2":
        return import_reading_teil2(path, row, identifier)
    if kind.startswith("listening_"):
        return import_listening(path, row, identifier, kind)
    if kind == "writing":
        return import_writing(path, row, identifier)
    if kind == "speaking_teil1":
        return import_speaking_teil1(path, row, identifier, generate_speaking_audio)
    if kind == "speaking_teil2":
        return import_speaking_teil2(path, row, identifier, generate_speaking_audio)
    normalized = _normalized_copy(path, kind)
    importer = KINDS[kind][1]
    old_infer = shared.infer_level_from_filename
    shared.infer_level_from_filename = lambda _path: "C1"
    try:
        count = importer(normalized)
    finally:
        shared.infer_level_from_filename = old_infer
    if kind in {"reading_teil3", "cloze_choice"}:
        exercise_type = "READING_UNDERSTANDING" if kind == "reading_teil3" else "CLOZE_CHOICE"
        shared.ExerciseBase.objects.filter(exam_type="TELC", level="C1", exercise_type=exercise_type,
            external_id=identifier).update(
                is_real_exam=shared.parse_bool(row.get("是否真题", "")), source_reference="",
                imported_from_file=path.name)
    return count


def _sheet_rows(path: Path, sheet: str) -> list[dict]:
    frame = pd.read_excel(path, sheet_name=sheet, engine="openpyxl").fillna("")
    return [{key: shared.clean_text(value) for key, value in row.items()} for row in frame.to_dict("records")]


def _numeric_id(value: object) -> str:
    return shared.normalize_link_id(value)


def _is_vortrag_translation_header(row: dict) -> bool:
    return (
        row.get("exercise_id", "").strip() == "角色"
        and row.get("Role", "").strip() == "环节"
        and row.get("内容", "").strip() == "德语文本"
        and row.get("translate", "").strip() == "中文翻译"
    )


def _speaking_example_rows(path: Path, kind: str) -> list[dict]:
    rows = [row for row in _sheet_rows(path, "example") if any(value.strip() for value in row.values())]
    if kind == "speaking_teil1":
        rows = [row for row in rows if not _is_vortrag_translation_header(row)]
    return rows


def _validate_c1_sample(path: Path, kind: str, identifier: str) -> None:
    meta, _ = workbook_meta(path)
    def check_ids(rows, column, sheet):
        if not rows or any(not _numeric_id(row.get(column)) for row in rows):
            raise shared.ImportErrorWithContext(f"{path.name}: {sheet} sheet has missing {column}")
        if any(_numeric_id(row[column]) != identifier for row in rows):
            raise shared.ImportErrorWithContext(f"{path.name}: ID mismatch in {sheet} sheet")

    if kind == "writing":
        quotes = [(meta.get("Zitat A", ""), meta.get("Zitat A_translate", "")),
                  (meta.get("Zitat B", meta.get("Zitat B ", "")), meta.get("Zitat B_translate", ""))]
        if any(not quote.strip() or not translation.strip() for quote, translation in quotes):
            raise shared.ImportErrorWithContext(f"{path.name}: both writing quotes and Chinese translations are required")
        try:
            if int(float(meta.get("time_limit", ""))) != 70 or int(float(meta.get("words_limit_min", ""))) != 350:
                raise ValueError
        except (TypeError, ValueError):
            raise shared.ImportErrorWithContext(f"{path.name}: writing limits must be 70 minutes and 350 words") from None
        texts, words = _sheet_rows(path, "text"), _sheet_rows(path, "word")
        check_ids(texts, "ID", "text")
        check_ids(words, "ID", "word")
        if any(not row.get("Example_Text") or not row.get("Chinese_translation") for row in texts):
            raise shared.ImportErrorWithContext(f"{path.name}: text sheet requires German and Chinese sample text")
        if any(not row.get("word") or not row.get("meaning") for row in words):
            raise shared.ImportErrorWithContext(f"{path.name}: word sheet contains an empty vocabulary entry")
    else:
        if kind == "speaking_teil1" and any(not meta.get(column) for column in ("task", "题目", "提纲")):
            raise shared.ImportErrorWithContext(f"{path.name}: Vortrag requires task, topic, and outline")
        turns = _speaking_example_rows(path, kind)
        check_ids(turns, "exercise_id", "example")
        turns = [turn for turn in turns if turn.get("内容")]
        required = 2 if kind == "speaking_teil1" else 1
        if len(turns) < required:
            raise shared.ImportErrorWithContext(f"{path.name}: expected at least {required} non-empty dialogue turn(s)")
        if any(not turn.get("Role") for turn in turns):
            raise shared.ImportErrorWithContext(f"{path.name}: example sheet has a turn without Role")
        if kind == "speaking_teil2" and (not meta.get("Zitat") or not meta.get("Zitat_translate", "")):
            raise shared.ImportErrorWithContext(f"{path.name}: quote and Chinese translation are required")


def import_writing(path: Path, meta: dict, identifier: str) -> int:
    _validate_c1_sample(path, "writing", identifier)
    texts, words = _sheet_rows(path, "text"), _sheet_rows(path, "word")
    sample_de = "\n\n".join(row["Example_Text"] for row in texts)
    sample_zh = "\n\n".join(row["Chinese_translation"] for row in texts)
    vocabulary = [{"term": row["word"], "translation_zh": row["meaning"]} for row in words]
    pages = [{"title": f"Wortschatz {index // 12 + 1}", "entries": vocabulary[index:index + 12]}
             for index in range(0, len(vocabulary), 12)]
    quotes = [
        {"text": meta["Zitat A"], "translation_zh": meta["Zitat A_translate"]},
        {"text": meta.get("Zitat B", meta.get("Zitat B ", "")), "translation_zh": meta["Zitat B_translate"]},
    ]
    instruction = meta.get("task", "")
    base = _base(path, identifier, meta, ExerciseBase.Skill.WRITING, ExerciseBase.ExerciseType.WRITING_PROMPT)
    content = {"quotes": quotes, "sample_de": sample_de, "time_limit_minutes": 70,
               "words_limit_min": 350, "vocabulary_pages": pages}
    exercise, _ = WritingExercise.objects.update_or_create(exercise_base=base, defaults={
        "request_text": instruction, "task_text": instruction, "time_limit_minutes": 70,
        "words_limit": 350, "content": content,
    })
    exercise.example_texts.all().delete()
    WritingExampleText.objects.create(writing_exercise=exercise, example_text=sample_de,
        translation_zh=sample_zh, label="C1 model response", note=meta.get("Title", ""), sort_order=1)
    return 1


def _speaking_payload(path: Path, meta: dict, identifier: str, kind: str, generate_speaking_audio: bool) -> int:
    _validate_c1_sample(path, kind, identifier)
    turns = [row for row in _speaking_example_rows(path, kind) if row.get("内容")]
    if kind == "speaking_teil1":
        groups = [("SPEAKING_TEIL1", turns[:1], "1A", 3),
                  ("SPEAKING_TEIL2", turns[1:], "1B", 2)]
    else:
        groups = [("SPEAKING_TEIL3", turns, "2", 6)]
    for exercise_type, source_turns, teil, minutes in groups:
        content = {"teil": teil, "time_limit_minutes": minutes,
                   "dialogue": [{"sequence": index, "role": turn["Role"], "text": turn["内容"],
                                 **({"translation_zh": turn["translate"]} if turn.get("translate") else {})}
                                for index, turn in enumerate(source_turns, start=1)]}
        if teil == "1A":
            content.update(topic=meta.get("题目", ""), outline=[item.strip() for item in meta.get("提纲", "").split(";") if item.strip()])
        if teil == "2":
            content.update(quote=meta["Zitat"], quote_translation_zh=[meta["Zitat_translate"]],
                           quotes=[{"text": meta["Zitat"], "translation_zh": meta["Zitat_translate"]}])
        parsed = {"level": "C1", "external_id": identifier, "title": meta.get("标题", ""),
                  "exam_type": "TELC", "is_real_exam": shared.parse_bool(meta.get("是否真题", "")),
                  "instruction": meta.get("task", meta.get("Task", "")), "content": content}
        shared.save_speaking_exercise(path, parsed, exercise_type, generate_speaking_audio=generate_speaking_audio)
    return len(groups)


def import_speaking_teil1(path: Path, meta: dict, identifier: str, generate_speaking_audio: bool = False) -> int:
    return _speaking_payload(path, meta, identifier, "speaking_teil1", generate_speaking_audio)


def import_speaking_teil2(path: Path, meta: dict, identifier: str, generate_speaking_audio: bool = False) -> int:
    return _speaking_payload(path, meta, identifier, "speaking_teil2", generate_speaking_audio)


def _reading_teil1_rows(path: Path):
    sheets = pd.read_excel(path, sheet_name=None, engine="openpyxl")
    options = [{key: shared.clean_text(value) for key, value in row.items()}
               for row in sheets["options"].to_dict("records")]
    answers = [{key: shared.clean_text(value) for key, value in row.items()}
               for row in sheets["answer"].to_dict("records")]
    return options, answers


def _validate_reading_teil1_structure(path: Path) -> None:
    options, answers = _reading_teil1_rows(path)
    _regular_reading_teil1_options(path, options, answers)


def _regular_reading_teil1_options(path: Path, options: list[dict], answers: list[dict]) -> list[dict]:
    example_rows = [row for row in answers if row.get("blank_key") == "blank_0"]
    if len(example_rows) != 1:
        raise shared.ImportErrorWithContext(f"{path.name}: expected exactly one blank_0 example answer")
    example_text = example_rows[0].get("correct_option_text", "")
    option_texts = {row.get("option_text", "") for row in options}
    if not example_text:
        raise shared.ImportErrorWithContext(f"{path.name}: blank_0 example answer is empty")
    regular = [row for row in options if _option_match_key(row.get("option_text", "")) != _option_match_key(example_text)]
    regular_texts = {_option_match_key(row.get("option_text", "")) for row in regular}
    if len(option_texts) != len(options) or len(regular_texts) not in {7, 8}:
        raise shared.ImportErrorWithContext(f"{path.name}: expected seven or eight unique regular options")
    missing = [row for row in answers if row.get("blank_key") != "blank_0"
               and _option_match_key(row.get("correct_option_text", "")) not in regular_texts]
    if missing and len(missing) == 1 and len(regular) == 7 and len(options) == 8:
        # Some exports put the example in the eight-row bank in place of one regular answer.
        missing_option = dict(missing[0])
        missing_option["option_key"] = f"option_{len(options) + 1}"
        missing_option["option_text"] = missing[0]["correct_option_text"]
        regular.append(missing_option)
        regular_texts.add(_option_match_key(missing_option["option_text"]))
        missing = []
    if missing or len(regular) not in {7, 8}:
        detail = f"answer {missing[0].get('blank_key')!r} is missing from the regular options" if missing else "expected seven or eight regular options"
        raise shared.ImportErrorWithContext(f"{path.name}: {detail}")
    return regular


def _option_match_key(value: str) -> str:
    return re.sub(r"[\s.!?]+$", "", re.sub(r"\s+", " ", value).strip()).casefold()


def import_reading_teil1(path: Path, meta: dict, identifier: str) -> int:
    _validate_reading_teil1_structure(path)
    options, answers = _reading_teil1_rows(path)
    base = _base(path, identifier, meta, ExerciseBase.Skill.READING, ExerciseBase.ExerciseType.CLOZE_MATCHING)
    base.is_real_exam = shared.parse_bool(meta.get("是否真题", ""))
    base.save(update_fields=["skill", "is_real_exam"])
    exercise, _ = ClozeMatchingExercise.objects.update_or_create(
        exercise_base=base,
        defaults={"content_with_placeholders": meta.get("内容", ""), "original_source_text": ""},
    )
    exercise.blank_answers.all().delete()
    exercise.options.all().delete()
    answer_by_key = {row["blank_key"]: row for row in answers}
    referenced = {_option_match_key(row["correct_option_text"]) for key, row in answer_by_key.items() if key != "blank_0"}
    blank0 = answer_by_key["blank_0"]
    example = ClozeMatchingOption.objects.create(
        exercise=exercise, option_key="beispiel", option_text=f"Beispiel (0): {blank0['correct_option_text']}",
        option_order=0, is_extra=False,
    )
    option_by_text = {}
    regular_options = _regular_reading_teil1_options(path, options, answers)
    for index, row in enumerate(regular_options, start=1):
        option_by_text[_option_match_key(row["option_text"])] = ClozeMatchingOption.objects.create(
            exercise=exercise, option_key=row.get("option_key") or shared.option_key_from_index(index - 1),
            option_text=row["option_text"], option_order=index,
            is_extra=_option_match_key(row["option_text"]) not in referenced,
        )
    for row in sorted(answers, key=lambda value: shared.parse_int(value["blank_number"], "blank_number")):
        number = shared.parse_int(row["blank_number"], "blank_number")
        correct_option = example if row["blank_key"] == "blank_0" else option_by_text[_option_match_key(row["correct_option_text"])]
        ClozeMatchingBlankAnswer.objects.create(
            exercise=exercise, blank_key=row["blank_key"], blank_number=number,
            correct_option=correct_option, explanation=row.get("explanation", ""),
        )
    return 1


def stage(source: Path) -> list[Path]:
    staged = []
    for path in sorted(source.rglob("*.xlsx")):
        kind = kind_for(path)
        kind_root = RAW_ROOT / KINDS[kind][0]
        issues = preflight([path])
        target_state = "failed" if issues else "raw"
        for issue in issues:
            print(f"INVALID (staged to failed): {issue}")
        for directory in ("raw", "processed", "failed"):
            (kind_root / directory).mkdir(parents=True, exist_ok=True)
        target = kind_root / target_state / path.name
        previous_raw = kind_root / "raw" / path.name
        if issues and previous_raw.exists():
            shutil.move(str(previous_raw), target)
        if not target.exists():
            shutil.copy2(path, target)
        if not issues:
            staged.append(target)
    return staged


def raw_files() -> list[Path]:
    files = []
    for folder in sorted({folder for folder, _ in KINDS.values()}):
        files.extend((RAW_ROOT / folder / "raw").glob("*.xlsx"))
    return sorted(files)


def _base(path, identifier, row, skill, exercise_type):
    return shared.upsert_base(
        level="C1", skill=skill, exercise_type=exercise_type, external_id=identifier,
        title=row.get("原标题", row.get("title", row.get("标题", row.get("Title", "")))),
        exam_type=row.get("考试类型", ""), is_real_exam=shared.parse_bool(row.get("是否真题", "")),
        imported_from_file=path.name,
    )


def import_reading_teil2(path: Path, meta: dict, identifier: str) -> int:
    _validate_reading_teil2_structure(path)
    frame = pd.read_excel(path, sheet_name="exercise", engine="openpyxl")
    base = _base(path, identifier, meta, ExerciseBase.Skill.READING, ExerciseBase.ExerciseType.READING_AD_MATCHING)
    exercise, _ = ReadingAdMatchingExercise.objects.update_or_create(exercise_base=base, defaults={"instruction": meta.get("task", "")})
    exercise.items.all().delete()
    exercise.ads.all().delete()
    paragraphs, questions = {}, []
    for raw in frame.to_dict("records"):
        row = {key: shared.clean_text(value) for key, value in raw.items()}
        paragraph_id, paragraph = row.get("Absatz_ID", ""), row.get("Textabsatz", "")
        if paragraph_id and paragraph and paragraph_id not in paragraphs:
            paragraphs[paragraph_id] = paragraph
        if row.get("Fragen"):
            questions.append((row["Fragen"], paragraph_id, row.get("Explaination", "")))
    paragraph_objects = {}
    for index, key in enumerate(sorted(paragraphs), start=1):
        paragraph_objects[key] = ReadingAdMatchingAd.objects.create(
            exercise=exercise, ad_key=key, ad_text_markdown=paragraphs[key], ad_order=index,
        )
    for index, (question, key, explanation) in enumerate(questions, start=1):
        if key not in paragraph_objects:
            raise shared.ImportErrorWithContext(f"{path.name}: question refers to missing Absatz_ID {key!r}")
        ReadingAdMatchingItem.objects.create(exercise=exercise, item_number=index, item_text=question,
                                             correct_ad=paragraph_objects[key], explanation=explanation)
    return 1


def _validate_reading_teil2_structure(path: Path) -> None:
    frame = pd.read_excel(path, sheet_name="exercise", engine="openpyxl").fillna("")
    required = {"Fragen", "Absatz_ID", "Textabsatz"}
    if not required.issubset(frame.columns):
        raise shared.ImportErrorWithContext(f"{path.name}: exercise sheet missing columns {sorted(required - set(frame.columns))}")
    paragraphs, questions = {}, []
    for raw in frame.to_dict("records"):
        row = {key: shared.clean_text(value) for key, value in raw.items()}
        paragraph_id = row.get("Absatz_ID", "").upper()
        if paragraph_id and row.get("Textabsatz"):
            paragraphs.setdefault(paragraph_id, row["Textabsatz"])
        if row.get("Fragen"):
            questions.append((row["Fragen"], paragraph_id))
    if set(paragraphs) != set("ABCDE"):
        raise shared.ImportErrorWithContext(f"{path.name}: expected non-empty text for paragraphs A–E")
    if not questions:
        raise shared.ImportErrorWithContext(f"{path.name}: reading Teil 2 contains no questions")
    version_questions = [question for question, _ in questions
                         if re.match(r"^\s*\(\s*version2\s*\)\s*", question, flags=re.IGNORECASE)]
    if version_questions:
        if len(questions) != 7:
            raise shared.ImportErrorWithContext(f"{path.name}: a Version2 set must contain exactly seven questions")
        if len(version_questions) != 1:
            raise shared.ImportErrorWithContext(f"{path.name}: a Version2 set must contain exactly one Version2 question")
    for question, paragraph_id in questions:
        if paragraph_id not in set("ABCDE"):
            raise shared.ImportErrorWithContext(
                f"{path.name}: question {question!r} must have an answer in paragraphs A–E"
            )


def import_listening(path: Path, meta: dict, identifier: str, kind: str) -> int:
    teil = kind.removeprefix("listening_teil")
    frame = pd.read_excel(path, sheet_name="exercise", engine="openpyxl")
    script = meta.get("copy") or meta.get("script", "")
    content = {"format": {"1": "speaker_matching", "2": "multiple_choice", "3": "presentation_notes"}[teil]}
    if teil == "1":
        content["statements"] = [
            {"statement_number": index, "statement": shared.clean_text(row.get("Aussage")),
             "speaker": shared.clean_text(row.get("Sprecher/in")),
             "explanation": shared.clean_text(row.get("Explanation"))}
            for index, row in enumerate(frame.to_dict("records"), start=1)
            if shared.clean_text(row.get("Aussage"))
        ]
    elif teil == "2":
        questions = []
        for number, group in frame.groupby("question_id", sort=True):
            rows = [{key: shared.clean_text(value) for key, value in row.items()} for row in group.to_dict("records")]
            options = [{"text": row.get("answer", ""), "is_correct": shared.parse_bool(row.get("is_correct", False)),
                        "explanation": row.get("Explanation", "")} for row in rows]
            if sum(option["is_correct"] for option in options) != 1:
                raise shared.ImportErrorWithContext(f"{path.name}: question {number} must have exactly one correct answer")
            questions.append({"question_number": int(number), "question": rows[0].get("question", ""), "options": options})
        content["questions"] = questions
    else:
        slides = {}
        for raw in frame.to_dict("records"):
            row = {key: shared.clean_text(value) for key, value in raw.items()}
            if row.get("Folie_ID") and row.get("Folie"):
                slide = slides.setdefault(row["Folie_ID"], {"number": row["Folie_ID"], "text": row["Folie"], "answers": []})
                if row.get("blank_ID"):
                    slide["answers"].append({"blank_id": row["blank_ID"], "answer": row.get("answer", "")})
        content["slides"] = list(slides.values())
    base = _base(path, identifier, meta, ExerciseBase.Skill.LISTENING,
                 getattr(ExerciseBase.ExerciseType, f"LISTENING_TEIL{teil}"))
    exercise, _ = ListeningExercise.objects.update_or_create(
        exercise_base=base,
        defaults={"listening_type": {
                      "1": ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_WITH_PREP,
                      "2": ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_ONCE,
                      "3": ListeningExercise.ListeningType.DIALOG_TRUE_FALSE_TWICE,
                  }[teil],
                  "audio_file_identifier": f"Teil{teil}_{identifier}",
                  "audio_file_url": f"/resources/ExamPreparation/exam_preparation_audio/telc_c1_hs_teil{teil}/Teil{teil}_{identifier}.mp3",
                  "script": script, "content": content},
    )
    question_defaults = []
    if teil == "1":
        statements = [statement for statement in content["statements"] if statement["speaker"]]
        speaker_numbers = [re.search(r"\d+", statement["speaker"]) for statement in statements]
        if len(statements) != 8 or any(match is None for match in speaker_numbers) \
                or sorted(int(match.group()) for match in speaker_numbers) != list(range(1, 9)):
            raise shared.ImportErrorWithContext(f"{path.name}: Teil 1 must have one statement for each speaker 1–8")
        speaker_options = [
            (shared.option_key_from_index(number - 1), f"Sprecher/in {number}", number)
            for number in range(1, 9)
        ]
        for question_number, statement in enumerate(statements, start=1):
            statement_speaker_number = int(re.search(r"\d+", statement["speaker"]).group())
            question_key = f"statement_{statement['statement_number']}"
            question, _ = ListeningQuestion.objects.update_or_create(
                listening_exercise=exercise,
                question_number=question_number,
                defaults={
                    "question_key": question_key,
                    "question_type": ListeningQuestion.QuestionType.SINGLE_CHOICE,
                    "question_text": statement["statement"],
                    "correct_answer": "",
                    "explanation": statement["explanation"],
                    "explanation_scope": "question",
                },
            )
            question_defaults.append(question_number)
            for option_key, option_text, option_speaker_number in speaker_options:
                ListeningAnswerOption.objects.update_or_create(
                    question=question,
                    option_key=option_key,
                    defaults={
                        "option_text": option_text,
                        "is_correct": option_speaker_number == statement_speaker_number,
                        "explanation": "",
                        "sort_order": option_speaker_number,
                    },
                )
            question.answer_options.exclude(option_key__in=[option[0] for option in speaker_options]).delete()
    elif teil == "2":
        for q in content["questions"]:
            question, _ = ListeningQuestion.objects.update_or_create(
                listening_exercise=exercise,
                question_number=q["question_number"],
                defaults={
                    "question_key": str(q["question_number"]),
                    "question_type": ListeningQuestion.QuestionType.SINGLE_CHOICE,
                    "question_text": q["question"],
                    "correct_answer": "",
                },
            )
            question_defaults.append(q["question_number"])
            option_keys = []
            for index, option in enumerate(q["options"]):
                option_key = shared.option_key_from_index(index)
                option_keys.append(option_key)
                ListeningAnswerOption.objects.update_or_create(
                    question=question,
                    option_key=option_key,
                    defaults={
                        "option_text": option["text"],
                        "is_correct": option["is_correct"],
                        "explanation": option["explanation"],
                        "sort_order": index + 1,
                    },
                )
            question.answer_options.exclude(option_key__in=option_keys).delete()
    else:
        blank_rows = [
            {"blank_id": answer["blank_id"], "answer": answer["answer"], "slide": str(slide["number"])}
            for slide in content["slides"] for answer in slide["answers"]
        ]
        for question_number, blank in enumerate(blank_rows, start=1):
            question, _ = ListeningQuestion.objects.update_or_create(
                listening_exercise=exercise,
                question_number=question_number,
                defaults={
                    "question_key": blank["blank_id"],
                    "question_type": ListeningQuestion.QuestionType.TEXT_INPUT,
                    "question_text": f"Lücke {blank['blank_id']} · Folie {blank['slide']}",
                    "correct_answer": blank["answer"],
                    "explanation": "",
                },
            )
            question_defaults.append(question_number)
            question.answer_options.all().delete()
    exercise.questions.exclude(question_number__in=question_defaults).delete()
    return 1


def import_seed_data() -> int:
    imported = 0
    vocabulary = {
        "seed-writing-literatur": [
            {"title": "Literatur und Wirkung", "entries": [
                {"term": "die Orientierung", "translation_zh": "指引；方向"},
                {"term": "die Ausgrenzung", "translation_zh": "排斥；边缘化"},
                {"term": "die Urteilskraft", "translation_zh": "判断力"},
                {"term": "die Wahrnehmung erweitern", "translation_zh": "拓宽认知"},
            ]},
            {"title": "Argumentieren", "entries": [
                {"term": "etwas in Betracht ziehen", "translation_zh": "把某事纳入考虑"},
                {"term": "eine Behauptung hinterfragen", "translation_zh": "质疑一种主张"},
                {"term": "einen Zusammenhang herstellen", "translation_zh": "建立联系"},
                {"term": "Verantwortung übernehmen", "translation_zh": "承担责任"},
            ]},
        ],
        "seed-writing-gruppenarbeit": [
            {"title": "Zusammenarbeit", "entries": [
                {"term": "die Zuständigkeit", "translation_zh": "职责；权限"},
                {"term": "der Perspektivwechsel", "translation_zh": "视角转换"},
                {"term": "der Beitrag", "translation_zh": "贡献"},
                {"term": "die Aufgabenverteilung", "translation_zh": "任务分配"},
            ]},
            {"title": "Bewerten und abwägen", "entries": [
                {"term": "etwas gegeneinander abwägen", "translation_zh": "权衡利弊"},
                {"term": "nachvollziehbar", "translation_zh": "有道理的；可理解的"},
                {"term": "eine Voraussetzung erfüllen", "translation_zh": "满足一个前提"},
                {"term": "einen Kompromiss entwickeln", "translation_zh": "形成折中方案"},
            ]},
        ],
    }
    for record in WRITING_SEEDS:
        base = shared.upsert_base(level="C1", skill=ExerciseBase.Skill.WRITING,
            exercise_type=ExerciseBase.ExerciseType.WRITING_PROMPT, external_id=record["external_id"],
            title=record["title"], exam_type="TELC", is_real_exam=False, imported_from_file="embedded_c1_hs_official_pdf_seed",
            source_name=SEED_PROVENANCE["type"], source_reference="TELC C1 Hochschule official practice-test PDF details")
        content = {key: record[key] for key in ("quotes", "outline", "sample_de")}
        content.update(time_limit_minutes=70, words_limit_min=350,
                       vocabulary_pages=vocabulary[record["external_id"]], provenance=SEED_PROVENANCE)
        exercise, _ = WritingExercise.objects.update_or_create(exercise_base=base, defaults={
            "request_text": record["instruction"], "task_text": record["instruction"],
            "time_limit_minutes": content["time_limit_minutes"], "words_limit": content["words_limit_min"],
            "content": content,
        })
        exercise.example_texts.all().delete()
        from apps.exam_preparation.models import WritingExampleText
        WritingExampleText.objects.create(writing_exercise=exercise, example_text=content["sample_de"],
            label="C1 model response", note=record["title"], sort_order=1)
        imported += 1
    speaking_types = {
        "1A": ExerciseBase.ExerciseType.SPEAKING_TEIL1,
        "1B": ExerciseBase.ExerciseType.SPEAKING_TEIL2,
        "2": ExerciseBase.ExerciseType.SPEAKING_TEIL3,
    }
    for record in SPEAKING_SEEDS:
        ex_type = speaking_types[record["teil"]]
        base = shared.upsert_base(level="C1", skill=ExerciseBase.Skill.SPEAKING, exercise_type=ex_type,
            external_id=record["external_id"], title=record["title"], exam_type="TELC", is_real_exam=False,
            imported_from_file="embedded_c1_hs_official_pdf_seed", source_name=SEED_PROVENANCE["type"],
            source_reference="TELC C1 Hochschule official practice-test PDF details")
        content = {key: value for key, value in record.items() if key not in {"external_id", "title", "instruction", "time_limit_minutes"}}
        content.update(teil=record["teil"], time_limit_minutes=record.get("time_limit_minutes"))
        content["provenance"] = SEED_PROVENANCE
        if "quotes" in content:
            content["quote_translation_zh"] = [quote["translation_zh"] for quote in content["quotes"]]
        content.setdefault("dialogue", [{"sequence": 1, "role": "TN1", "text": content.get("sample_de", "")}])
        for turn in content.get("dialogue", []):
            turn["audio_url"] = speaking_turn_audio_url(exercise_type=ex_type, exam_type="TELC", level="C1",
                external_id=record["external_id"], sequence=turn["sequence"])
        SpeakingTeilExercise.objects.update_or_create(exercise_base=base, defaults={
            "instruction": record["instruction"], "content": content,
        })
        imported += 1
    return imported


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--file", type=Path)
    parser.add_argument("--preflight", action="store_true", help="validate exam type and batch identity only")
    parser.add_argument("--stage", action="store_true", help="copy Drive exports into isolated C1 raw folders")
    parser.add_argument("--no-move", action="store_true")
    parser.add_argument("--import-seeds", action="store_true", help="import the embedded writing and speaking practice samples")
    parser.add_argument("--skip-speaking-audio", action="store_true", help="import model text without generating speaking audio")
    args = parser.parse_args()
    files = [args.file] if args.file else (stage(args.source_dir) if args.stage else raw_files())
    if not files:
        print("No C1 Hochschule workbooks found.")
        if args.import_seeds:
            count = import_seed_data()
            print(f"OK: imported {count} embedded practice samples")
        return 0
    issues = preflight(files)
    if issues:
        for issue in issues:
            print(f"INVALID: {issue}")
        return 1
    elif args.preflight:
        print(f"Preflight passed: {len(files)} workbook(s).")
        return 0
    failures = 0
    for path in files:
        try:
            import_workbook(path, generate_speaking_audio=not args.skip_speaking_audio)
            print(f"OK: {path.name}")
            if not args.no_move and path.parent.name == "raw":
                processed = path.parent.parent / "processed"
                processed.mkdir(parents=True, exist_ok=True)
                shutil.move(str(path), processed / path.name)
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAILED: {path.name}: {exc}")
            if not args.no_move and path.parent.name == "raw":
                failed = path.parent.parent / "failed"
                failed.mkdir(parents=True, exist_ok=True)
                shutil.move(str(path), failed / path.name)
    if args.import_seeds:
        try:
            count = import_seed_data()
            print(f"OK: imported {count} embedded practice samples")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"FAILED: embedded practice samples: {exc}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
