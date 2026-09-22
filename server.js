const express = require("express");
const cheerio = require("cheerio");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static("public"));

const SOURCES = {
  mn: "https://sxmn.com.vn/",
  mt: "https://sxmn.com.vn/xsmt-xo-so-mien-trung",
  mb: "https://sxmn.com.vn/xsmb-60-ngay"
};

const STATIONS = {
  mn: [
    "TP Hồ Chí Minh",
    "Đồng Nai",
    "Cần Thơ",
    "Sóc Trăng",
    "Bạc Liêu",
    "Vũng Tàu",
    "Đồng Tháp",
    "Cà Mau",
    "Bến Tre",
    "Tây Ninh",
    "An Giang",
    "Bình Thuận",
    "Long An",
    "Tiền Giang",
    "Kiên Giang",
    "Trà Vinh",
    "Vĩnh Long"
  ],
  mt: [
    "Đà Nẵng",
    "Quảng Nam",
    "Quảng Ngãi",
    "Bình Định",
    "Phú Yên",
    "Khánh Hòa",
    "Ninh Thuận",
    "Bình Thuận",
    "Kon Tum",
    "Gia Lai",
    "Đắk Lắk",
    "Đắk Nông",
    "Quảng Bình",
    "Quảng Trị",
    "Thừa Thiên Huế"
  ],
  mb: [
    "Hà Nội",
    "Quảng Ninh",
    "Bắc Ninh",
    "Hải Phòng",
    "Nam Định",
    "Thái Bình"
  ]
};

const PRIZES = [
  "G8",
  "G7",
  "G6",
  "G5",
  "G4",
  "G3",
  "G2",
  "G1",
  "ĐB"
];

let database = {
  mn: [],
  mt: [],
  mb: [],
  updatedAt: null
};

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStation(name) {
  const n = cleanText(name).toLowerCase();

  const map = {
    "tp.hcm": "TP Hồ Chí Minh",
    "tp hcm": "TP Hồ Chí Minh",
    "tphcm": "TP Hồ Chí Minh",
    "hồ chí minh": "TP Hồ Chí Minh",
    "thừa thiên huế": "Thừa Thiên Huế"
  };

  return map[n] || cleanText(name);
}

function isPrize(text) {
  const t = cleanText(text).toUpperCase();

  return PRIZES.includes(t) ||
    t === "GĐB" ||
    t === "ĐẶC BIỆT";
}

function prizeName(text) {
  const t = cleanText(text).toUpperCase();

  if (t === "GĐB" || t === "ĐẶC BIỆT") {
    return "ĐB";
  }

  return t;
}

function findDate(text) {
  const m = String(text || "").match(
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/
  );

  if (!m) return null;

  const d = String(m[1]).padStart(2, "0");
  const mo = String(m[2]).padStart(2, "0");
  const y = m[3];

  return `${d}/${mo}/${y}`;
}

function weekday(dateString) {
  if (!dateString) return "";

  const [d, m, y] = dateString.split("/").map(Number);
  const date = new Date(y, m - 1, d);

  const names = [
    "Chủ nhật",
    "Thứ 2",
    "Thứ 3",
    "Thứ 4",
    "Thứ 5",
    "Thứ 6",
    "Thứ 7"
  ];

  return names[date.getDay()];
}

function dateToNumber(dateString) {
  if (!dateString) return 0;

  const [d, m, y] = dateString.split("/").map(Number);

  return y * 10000 + m * 100 + d;
}

function detectStations($, table) {
  const found = [];

  $(table)
    .find("th, td")
    .each((_, el) => {
      const text = cleanText($(el).text());

      for (const station of [
        ...STATIONS.mn,
        ...STATIONS.mt,
        ...STATIONS.mb
      ]) {
        if (
          text === station ||
          text.toLowerCase().includes(station.toLowerCase())
        ) {
          if (!found.includes(station)) {
            found.push(station);
          }
        }
      }
    });

  return found;
}

function parseTable($, table, region) {
  const stations = detectStations($, table);

  if (!stations.length) return [];

  const rows = [];

  $(table)
    .find("tr")
    .each((_, tr) => {
      const cells = $(tr)
        .find("th,td")
        .map((_, cell) => cleanText($(cell).text()))
        .get();

      if (!cells.length) return;

      const prizeIndex = cells.findIndex((x) => isPrize(x));

      if (prizeIndex === -1) return;

      const label = prizeName(cells[prizeIndex]);

      const values = cells
        .slice(prizeIndex + 1)
        .filter((x) => x && !isPrize(x));

      if (!values.length) return;

      rows.push({
        label,
        values
      });
    });

  if (!rows.length) return [];

  let date = null;

  const tableHtml = $.html(table);

  date = findDate(tableHtml);

  if (!date) {
    const parentHtml = $.html($(table).parent());
    date = findDate(parentHtml);
  }

  if (!date) {
    const pageText = $("body").text();
    date = findDate(pageText);
  }

  return stations.map((station) => ({
    station: normalizeStation(station),
    date,
    weekday: weekday(date),
    displayDate: date ? `Ngày ${date}` : "",
    rows: rows.map((r) => ({
      label: r.label,
      value: r.values.join(" ")
    }))
  }));
}

async function fetchRegion(region) {
  const response = await fetch(SOURCES[region], {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const results = [];

  $("table").each((_, table) => {
    const parsed = parseTable($, table, region);

    if (parsed.length) {
      results.push(...parsed);
    }
  });

  const dates = results
    .map((x) => x.date)
    .filter(Boolean)
    .sort((a, b) => dateToNumber(b) - dateToNumber(a));

  const latestDate = dates[0];

  const filtered = latestDate
    ? results.filter((x) => x.date === latestDate)
    : results;

  const unique = [];

  for (const item of filtered) {
    const exists = unique.some(
      (x) =>
        x.station === item.station &&
        x.date === item.date
    );

    if (!exists) {
      unique.push(item);
    }
  }

  return unique;
}

function analyzeStation(item) {
  const head = {};
  const tail = {};

  for (const row of item.rows || []) {
    const numbers = String(row.value || "")
      .split(/\s+/)
      .filter((x) => /^\d+$/.test(x));

    for (const number of numbers) {
      if (!number) continue;

      const n = number.padStart(2, "0");
      const first = n.slice(0, 1);
      const last = n.slice(-1);

      head[first] = (head[first] || 0) + 1;
      tail[last] = (tail[last] || 0) + 1;
    }
  }

  return {
    station: item.station,
    date: item.date,
    weekday: item.weekday,
    head,
    tail,
    totalPoint: Object.values(head).reduce(
      (sum, value) => sum + value,
      0
    )
  };
}

async function updateAll() {
  for (const region of ["mn", "mt", "mb"]) {
    try {
      database[region] = await fetchRegion(region);
    } catch (error) {
      console.error(
        `Lỗi cập nhật ${region}:`,
        error.message
      );
    }
  }

  database.updatedAt = new Date().toISOString();

  return database;
}

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    updatedAt: database.updatedAt,
    counts: {
      mn: database.mn.length,
      mt: database.mt.length,
      mb: database.mb.length
    }
  });
});

app.get("/api/results", (req, res) => {
  const region = String(req.query.region || "mn").toLowerCase();

  if (!database[region]) {
    return res.status(400).json({
      error: "Khu vực không hợp lệ"
    });
  }

  res.json({
    region,
    updatedAt: database.updatedAt,
    results: database[region]
  });
});

app.get("/api/station", (req, res) => {
  const region = String(req.query.region || "mn").toLowerCase();
  const station = cleanText(req.query.station || "");

  if (!database[region]) {
    return res.status(400).json({
      error: "Khu vực không hợp lệ"
    });
  }

  const result = database[region].find(
    (x) =>
      x.station.toLowerCase() ===
      station.toLowerCase()
  );

  if (!result) {
    return res.status(404).json({
      error: "Không tìm thấy đài"
    });
  }

  res.json({
    ...result,
    analysis: analyzeStation(result)
  });
});

app.get("/api/analyze", (req, res) => {
  const region = String(req.query.region || "mn").toLowerCase();

  if (!database[region]) {
    return res.status(400).json({
      error: "Khu vực không hợp lệ"
    });
  }

  res.json({
    region,
    updatedAt: database.updatedAt,
    results: database[region].map(analyzeStation)
  });
});

app.get("/api/schedule", (req, res) => {
  res.json({
    mn: "11h30 - 17h30",
    mt: "17h15",
    mb: "18h15",
    update: "Mỗi 30 phút"
  });
});

app.post("/api/update", async (req, res) => {
  try {
    await updateAll();

    res.json({
      ok: true,
      message: "Đã cập nhật dữ liệu thành công.",
      updatedAt: database.updatedAt
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(
    require("path").join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Vé Số Phát Đạt đang chạy tại port ${PORT}`);

  try {
    await updateAll();
    console.log("Đã cập nhật dữ liệu ban đầu.");
  } catch (error) {
    console.error(
      "Không thể cập nhật dữ liệu ban đầu:",
      error.message
    );
  }
});

cron.schedule("*/30 * * * *", async () => {
  console.log("Tự động cập nhật dữ liệu...");

  try {
    await updateAll();
    console.log("Cập nhật xong.");
  } catch (error) {
    console.error(
      "Lỗi cập nhật tự động:",
      error.message
    );
  }
});
