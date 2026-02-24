type OldMurajaahScoreCategory =
  | "memorization"
  | "middle_verse"
  | "last_words"
  | "reversal_reading"
  | "verse_position";

const OLD_MURAJAAH_TEST_QUESTION_CONFIG: Record<
  OldMurajaahScoreCategory,
  { title: string; questionNumbers: number[] }
> = {
  memorization: {
    title: "Repeat and Continue",
    questionNumbers: [1, 2]
  },
  middle_verse: {
    title: "Middle of the Verse",
    questionNumbers: [1]
  },
  last_words: {
    title: "Last of the Verse",
    questionNumbers: [1]
  },
  reversal_reading: {
    title: "Reversal Reading",
    questionNumbers: [1]
  },
  verse_position: {
    title: "Position of the Verse",
    questionNumbers: [1]
  }
};

interface OldMurajaahSection2Scores {
  memorization: Record<string, number>;
  middle_verse: Record<string, number>;
  last_words: Record<string, number>;
  reversal_reading: Record<string, number>;
  verse_position: Record<string, number>;
}

interface ReportLike {
  id: string;
  type: string;
  date: string;
  juzuk: number | null;
  page_from: number | null;
  page_to: number | null;
  ayat_from: number;
  ayat_to: number;
  reading_progress?: unknown;
}

interface ParsedAssessmentSnapshot {
  section2Scores: OldMurajaahSection2Scores;
  readVerseNoScore: number;
  understandingScore: number;
  totalPercentage: number;
  passThreshold: number;
  passed: boolean;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeType = (type: string | null | undefined) =>
  (type ?? "").trim().toLowerCase();

const isOldMurajaahType = (type: string | null | undefined) => {
  const normalized = normalizeType(type);
  return normalized === "old murajaah" || normalized === "murajaah";
};

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
};

const parseSection2CategoryScores = (
  source: unknown,
  questionNumbers: number[]
): Record<string, number> => {
  const safeSource = isObject(source) ? source : {};
  const output: Record<string, number> = {};
  questionNumbers.forEach((questionNumber) => {
    const key = String(questionNumber);
    output[key] = toNumber(safeSource[key], 0);
  });
  return output;
};

const parseOldMurajaahAssessment = (
  report: ReportLike
): ParsedAssessmentSnapshot | null => {
  if (!isOldMurajaahType(report.type)) return null;

  const readingProgress = isObject(report.reading_progress)
    ? report.reading_progress
    : null;
  if (!readingProgress || readingProgress.murajaah_mode !== "test") return null;

  const testAssessment = isObject(readingProgress.test_assessment)
    ? readingProgress.test_assessment
    : null;
  if (!testAssessment) return null;

  const section2Raw = isObject(testAssessment.section2_scores)
    ? testAssessment.section2_scores
    : {};

  const section2Scores: OldMurajaahSection2Scores = {
    memorization: parseSection2CategoryScores(
      section2Raw.memorization,
      OLD_MURAJAAH_TEST_QUESTION_CONFIG.memorization.questionNumbers
    ),
    middle_verse: parseSection2CategoryScores(
      section2Raw.middle_verse,
      OLD_MURAJAAH_TEST_QUESTION_CONFIG.middle_verse.questionNumbers
    ),
    last_words: parseSection2CategoryScores(
      section2Raw.last_words,
      OLD_MURAJAAH_TEST_QUESTION_CONFIG.last_words.questionNumbers
    ),
    reversal_reading: parseSection2CategoryScores(
      section2Raw.reversal_reading,
      OLD_MURAJAAH_TEST_QUESTION_CONFIG.reversal_reading.questionNumbers
    ),
    verse_position: parseSection2CategoryScores(
      section2Raw.verse_position,
      OLD_MURAJAAH_TEST_QUESTION_CONFIG.verse_position.questionNumbers
    )
  };

  const section2Total = Object.values(section2Scores).reduce((sum, category) => {
    return (
      sum +
      Object.values(category).reduce<number>(
        (categorySum, score) => categorySum + Number(score),
        0
      )
    );
  }, 0);
  const readVerseNoScore = toNumber(testAssessment.read_verse_no_score, 0);
  const understandingScore = toNumber(testAssessment.understanding_score, 0);
  const totalPercentage = toNumber(testAssessment.total_percentage, 0);
  const passThreshold = toNumber(testAssessment.pass_threshold, 60);
  const passed =
    typeof testAssessment.passed === "boolean"
      ? testAssessment.passed
      : totalPercentage >= passThreshold;

  const maxSection2Score = Object.values(OLD_MURAJAAH_TEST_QUESTION_CONFIG).reduce(
    (sum, config) => sum + config.questionNumbers.length * 5,
    0
  );
  const maxTotalScore = maxSection2Score + 10;
  const recomputedPercentage = maxTotalScore
    ? Math.round(
        ((section2Total + readVerseNoScore + understandingScore) / maxTotalScore) *
          100
      )
    : 0;

  return {
    section2Scores,
    readVerseNoScore,
    understandingScore,
    totalPercentage: totalPercentage || recomputedPercentage,
    passThreshold,
    passed
  };
};

const formatFileName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const formatWeekOfMonth = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  const week = Math.min(4, Math.max(1, Math.ceil(parsed.getDate() / 7)));
  const month = parsed.toLocaleDateString("en-GB", { month: "short" });
  return `W${week} ${month} ${parsed.getFullYear()}`;
};

const getPageDisplay = (pageFrom: number | null, pageTo: number | null) => {
  const pages = [pageFrom, pageTo].filter(
    (value): value is number => typeof value === "number" && !Number.isNaN(value)
  );
  if (pages.length === 0) return "-";
  return `${Math.min(...pages)}-${Math.max(...pages)}`;
};

let cachedAakLogoDataUrl: string | null | undefined;

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Failed to convert logo blob to data URL."));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Unable to read logo file."));
    };
    reader.readAsDataURL(blob);
  });

const loadAakLogoDataUrl = async () => {
  if (cachedAakLogoDataUrl !== undefined) return cachedAakLogoDataUrl;
  if (typeof window === "undefined") {
    cachedAakLogoDataUrl = null;
    return null;
  }

  const logoCandidates = ["/icon.png", "/icon", "/apple-icon.png"];
  for (const logoPath of logoCandidates) {
    try {
      const response = await fetch(logoPath, { cache: "force-cache" });
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) continue;

      const logoBlob = await response.blob();
      cachedAakLogoDataUrl = await blobToDataUrl(logoBlob);
      return cachedAakLogoDataUrl;
    } catch {
      // Keep trying other icon paths.
    }
  }

  cachedAakLogoDataUrl = null;
  return null;
};

export const canExportOldMurajaahTestPdf = (report: ReportLike) =>
  Boolean(parseOldMurajaahAssessment(report));

export const downloadOldMurajaahTestSnapshotPdf = async (
  report: ReportLike,
  studentName: string,
  allReports: ReportLike[] = [],
  halaqahTeacherName?: string | null
) => {
  const assessment = parseOldMurajaahAssessment(report);
  if (!assessment) {
    throw new Error("This report is not an old murajaah test record.");
  }

  const [{ default: JsPdf }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable")
  ]);

  const maxSection2Score = Object.values(OLD_MURAJAAH_TEST_QUESTION_CONFIG).reduce(
    (sum, config) => sum + config.questionNumbers.length * 5,
    0
  );
  const maxTotalScore = maxSection2Score + 10;

  const getSnapshotTotals = (snapshot: ParsedAssessmentSnapshot) => {
    const section2Total = Object.values(snapshot.section2Scores).reduce(
      (sum, category) =>
        sum +
        Object.values(category).reduce<number>(
          (categorySum, score) => categorySum + Number(score),
          0
        ),
      0
    );
    const totalScore =
      section2Total + snapshot.readVerseNoScore + snapshot.understandingScore;
    const percentage = maxTotalScore
      ? Math.round((totalScore / maxTotalScore) * 100)
      : 0;
    const passed = percentage >= snapshot.passThreshold;

    return { section2Total, totalScore, percentage, passed };
  };

  const currentTotals = getSnapshotTotals(assessment);
  const sourceReports = allReports.some((item) => item.id === report.id)
    ? allReports
    : [report, ...allReports];

  type ParsedReportSnapshot = {
    report: ReportLike;
    assessment: ParsedAssessmentSnapshot;
    percentage: number;
    passed: boolean;
    timestamp: number;
  };

  const allTestSnapshots: ParsedReportSnapshot[] = sourceReports
    .map((item) => {
      const itemAssessment = parseOldMurajaahAssessment(item);
      if (!itemAssessment) return null;
      const itemTotals = getSnapshotTotals(itemAssessment);
      return {
        report: item,
        assessment: itemAssessment,
        percentage: itemTotals.percentage,
        passed: itemTotals.passed,
        timestamp: new Date(item.date).getTime()
      };
    })
    .filter((item): item is ParsedReportSnapshot => item !== null)
    .sort((a, b) => b.timestamp - a.timestamp);

  const currentTimestamp = new Date(report.date).getTime();
  const previousSnapshot =
    allTestSnapshots.find(
      (item) =>
        item.report.id !== report.id &&
        (Number.isNaN(currentTimestamp) ? true : item.timestamp < currentTimestamp)
    ) ??
    allTestSnapshots.find((item) => item.report.id !== report.id) ??
    null;

  const totalTestsTaken = allTestSnapshots.length || 1;
  const passCount = allTestSnapshots.filter((item) => item.passed).length;
  const passRate = totalTestsTaken
    ? Math.round((passCount / totalTestsTaken) * 100)
    : 0;
  const averageMark = totalTestsTaken
    ? Math.round(
        allTestSnapshots.reduce((sum, item) => sum + item.percentage, 0) /
          totalTestsTaken
      )
    : null;
  const previousTestMark = previousSnapshot ? `${previousSnapshot.percentage}%` : "-";

  const generatedAt = new Date();
  const doc = new JsPdf({ orientation: "p", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const logoDataUrl = await loadAakLogoDataUrl();
  const leftColumnX = logoDataUrl ? 31 : 16;
  const teacherDisplay = (halaqahTeacherName ?? "").trim() || "-";
  const statusColor: [number, number, number] = currentTotals.passed
    ? [22, 163, 74]
    : [220, 38, 38];

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", 16, 11, 11, 11, undefined, "FAST");
  }

  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.text("Old Murajaah Test Results", leftColumnX, 17);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(10);
  doc.text(`Generated: ${formatDate(generatedAt.toISOString())}`, leftColumnX, 23);

  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.roundedRect(pageWidth - 58, 11, 42, 14, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10.5);
  doc.text(currentTotals.passed ? "PASSED" : "FAILED", pageWidth - 37, 17, {
    align: "center"
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(`${currentTotals.percentage}%`, pageWidth - 37, 22.5, { align: "center" });

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(`Student: ${studentName}`, 14, 36);
  doc.text(`Date: ${formatDate(report.date)}`, 14, 41);
  doc.text(`Week: ${formatWeekOfMonth(report.date)}`, 14, 46);
  doc.text(`Halaqah Teacher: ${teacherDisplay}`, 14, 51);
  doc.text(`Juz: ${report.juzuk ?? "-"}`, 105, 36);
  doc.text(`Pages: ${getPageDisplay(report.page_from, report.page_to)}`, 105, 41);

  const criteriaRows = (
    Object.entries(OLD_MURAJAAH_TEST_QUESTION_CONFIG) as Array<
      [OldMurajaahScoreCategory, { title: string; questionNumbers: number[] }]
    >
  ).map(([category, config]) => {
    const q1 = assessment.section2Scores[category]["1"] ?? 0;
    const q2 = config.questionNumbers.includes(2)
      ? String(assessment.section2Scores[category]["2"] ?? 0)
      : "N/A";
    const total = config.questionNumbers.reduce((sum, questionNumber) => {
      return sum + (assessment.section2Scores[category][String(questionNumber)] ?? 0);
    }, 0);
    return [config.title, String(q1), q2, `${total}/${config.questionNumbers.length * 5}`];
  });

  criteriaRows.push(
    [
      "Read Verse Number",
      String(assessment.readVerseNoScore),
      "N/A",
      `${assessment.readVerseNoScore}/5`
    ],
    ["Understanding", String(assessment.understandingScore), "N/A", `${assessment.understandingScore}/5`]
  );

  autoTable(doc, {
    startY: 64,
    margin: { left: 14, right: 14 },
    head: [["Criteria", "Q1", "Q2", "Total"]],
    body: criteriaRows,
    theme: "grid",
    styles: {
      fontSize: 9.8,
      cellPadding: 3,
      textColor: [17, 24, 39],
      lineColor: [208, 216, 226],
      lineWidth: 0.18
    },
    headStyles: {
      fillColor: [223, 232, 244],
      textColor: [15, 23, 42],
      fontStyle: "bold"
    },
    alternateRowStyles: { fillColor: [245, 248, 252] },
    columnStyles: {
      0: { cellWidth: 105 },
      1: { cellWidth: 20, halign: "right" },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 28, halign: "right" }
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastY = (doc as any).lastAutoTable?.finalY ?? 130;

  const summaryY = lastY + 12;
  doc.setDrawColor(214, 203, 182);
  doc.setLineWidth(0.2);
  doc.roundedRect(14, summaryY, 182, 18, 2, 2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(31, 41, 55);
  doc.text(`Total Tests: ${totalTestsTaken}`, 18, summaryY + 7);
  doc.text(`Pass Rate: ${passRate}%`, 105, summaryY + 7);
  doc.text(
    `Average Mark: ${averageMark !== null ? `${averageMark}%` : "-"}`,
    18,
    summaryY + 14
  );
  doc.text(`Previous Test Mark: ${previousTestMark}`, 105, summaryY + 14);
  doc.setLineWidth(0.1);

  const fileDate = generatedAt.toISOString().slice(0, 10);
  const safeStudentName = formatFileName(studentName || "student");
  doc.save(`${safeStudentName}-old-murajaah-test-results-${fileDate}.pdf`);
};
