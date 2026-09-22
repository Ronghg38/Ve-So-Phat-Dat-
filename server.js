const express = require("express");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 10000;

const DATA_FILE = path.join(__dirname, "data.json");

const SOURCES = {
  mn: "https://sxmn.com.vn/",
  mt: "https://sxmn.com.vn/xsmt-xo-so-mien-trung",
  mb: "https://sxmn.com.vn/xsmb-60-ngay"
};

const STATIONS = {
  mn: [
    "TP.HCM",
    "Đồng Nai",
    "Cần Thơ",
    "Sóc Trăng",
    "Bạc Liêu",
    "Vũng Tàu",
    "Bến Tre",
    "Tây Ninh",
    "An Giang",
    "Bình Thuận",
    "Vĩnh Long",
    "Bình Dương",
    "Trà Vinh",
    "Long An",
    "Bình Phước",
    "Hậu Giang",
    "Tiền Giang",
    "Kiên Giang",
    "Đà Lạt",
    "Đồng Tháp",
    "Cà Mau"
  ],

  mt: [
    "Khánh Hòa",
    "Kon Tum",
    "Huế",
    "Phú Yên",
    "Đà Nẵng",
    "Đắk Lắk",
    "Quảng Nam",
    "Bình Định",
    "Quảng Bình",
    "Quảng Trị",
    "Gia Lai",
    "Ninh Thuận",
    "Quảng Ngãi",
    "Đắk Nông"
  ],

  mb: [
    "Miền Bắc"
  ]
};

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return {
        mn: [],
        mt: [],
        mb: []
      };
    }

    return JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  } catch (e) {
    return {
      mn: [],
      mt: [],
      mb: []
    };
  }
}

function saveData(data) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(text) {
  return cleanText(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findStation(text, region) {
  const n = normalize(text);

  for (const station of STATIONS[region]) {
    if (n.includes(normalize(station))) {
      return station;
    }
  }

  return null;
}

async function fetchRegion(region) {
  const response = await fetch(SOURCES[region]);

  if (!response.ok) {
    throw new Error(
      "Không tải được nguồn " + region
    );
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const result = [];
  const seen = new Set();

  $("table").each((tableIndex, table) => {

    const rows = [];

    $(table).find("tr").each((i, tr) => {

      const cells = [];

      $(tr).find("th,td").each((j, cell) => {
        cells.push(
          cleanText($(cell).text())
        );
      });

      if (cells.length) {
        rows.push(cells);
      }
    });

    if (!rows.length) return;

    let headerIndex = -1;
    let stationColumns = {};

    for (let i = 0; i < rows.length; i++) {

      const row = rows[i];

      const found = {};

      row.forEach((cell, index) => {

        const station =
          findStation(cell, region);

        if (station) {
          found[station] = index;
        }
      });

      if (Object.keys(found).length) {

        headerIndex = i;
        stationColumns = found;

        break;
      }
    }

    if (headerIndex === -1) return;

    Object.entries(stationColumns).forEach(
      ([station, columnIndex]) => {

        const stationRows = [];

        for (
          let r = headerIndex + 1;
          r < rows.length;
          r++
        ) {

          const row = rows[r];

          if (!row[columnIndex]) continue;

          const value =
            cleanText(row[columnIndex]);

          if (!value) continue;

          let label = "";

          if (row[0] && columnIndex !== 0) {
            label = cleanText(row[0]);
          }

          stationRows.push([
            label,
            value
          ]);
        }

        if (
          stationRows.length &&
          !seen.has(station)
        ) {

          seen.add(station);

          result.push({
            station,
            rows: stationRows
          });
        }
      }
    );
  });

  return result;
}

async function updateAll() {

  const data = loadData();

  for (const region of [
    "mn",
    "mt",
    "mb"
  ]) {

    try {

      data[region] =
        await fetchRegion(region);

    } catch (error) {

      console.error(
        "Lỗi cập nhật " +
        region +
        ":",
        error.message
      );
    }
  }

  data.updatedAt =
    new Date().toISOString();

  saveData(data);

  return data;
}

function analyzeRegion(region) {

  const data = loadData();
  const stations =
    data[region] || [];

  const heads = {};
  const tails = {};
  const stationSets = [];

  stations.forEach(station => {

    const numbers = [];

    station.rows.forEach(row => {

      const value =
        String(row[1] || "");

      const matches =
        value.match(/\d{2,6}/g) || [];

      matches.forEach(number => {

        const last2 =
          number.slice(-2);

        if (last2.length === 2) {

          const head =
            last2.charAt(0);

          const tail =
            last2.charAt(1);

          heads[head] =
            (heads[head] || 0) + 1;

          tails[tail] =
            (tails[tail] || 0) + 1;

          numbers.push(last2);
        }
      });
    });

    stationSets.push(
      new Set(numbers)
    );
  });

  const overlap = [];

  if (stationSets.length >= 2) {

    const first =
      [...stationSets[0]];

    first.forEach(number => {

      let count = 0;

      stationSets.forEach(set => {

        if (set.has(number)) {
          count++;
        }
      });

      if (count >= 2) {
        overlap.push(number);
      }
    });
  }

  return {
    heads,
    tails,
    overlap
  };
}

app.get("/api/status", (req, res) => {

  const data = loadData();

  res.json({
    ok: true,
    message: "Máy chủ đang hoạt động",
    updatedAt: data.updatedAt || null
  });
});

app.get("/api/results", (req, res) => {

  const region =
    ["mn", "mt", "mb"].includes(
      req.query.region
    )
      ? req.query.region
      : "mn";

  const data = loadData();

  res.json(
    data[region] || []
  );
});

app.get("/api/analyze", (req, res) => {

  const region =
    ["mn", "mt", "mb"].includes(
      req.query.region
    )
      ? req.query.region
      : "mn";

  res.json(
    analyzeRegion(region)
  );
});

app.get("/api/schedule", (req, res) => {

  const day =
    new Date().getDay();

  const schedules = {

    0: {
      mn: [
        "Tiền Giang",
        "Kiên Giang",
        "Đà Lạt"
      ],
      mt: [
        "Khánh Hòa",
        "Kon Tum",
        "Huế"
      ]
    },

    1: {
      mn: [
        "TP.HCM",
        "Đồng Tháp",
        "Cà Mau"
      ],
      mt: [
        "Huế",
        "Phú Yên"
      ]
    },

    2: {
      mn: [
        "Bạc Liêu",
        "Vũng Tàu",
        "Bến Tre"
      ],
      mt: [
        "Đắk Lắk",
        "Quảng Nam"
      ]
    },

    3: {
      mn: [
        "Đồng Nai",
        "Cần Thơ",
        "Sóc Trăng"
      ],
      mt: [
        "Đà Nẵng",
        "Khánh Hòa"
      ]
    },

    4: {
      mn: [
        "Tây Ninh",
        "An Giang",
        "Bình Thuận"
      ],
      mt: [
        "Bình Định",
        "Quảng Bình",
        "Quảng Trị"
      ]
    },

    5: {
      mn: [
        "Vĩnh Long",
        "Bình Dương",
        "Trà Vinh"
      ],
      mt: [
        "Gia Lai",
        "Ninh Thuận"
      ]
    },

    6: {
      mn: [
        "TP.HCM",
        "Long An",
        "Bình Phước",
        "Hậu Giang"
      ],
      mt: [
        "Đà Nẵng",
        "Quảng Ngãi",
        "Đắk Nông"
      ]
    }
  };

  res.json({
    mn: schedules[day].mn,
    mt: schedules[day].mt,
    mb: ["Miền Bắc"]
  });
});

app.get("/api/update", async (req, res) => {

  try {

    await updateAll();

    res.json({
      success: true,
      message:
        "Đã cập nhật dữ liệu thành công"
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

cron.schedule(
  "*/30 * * * *",
  async () => {

    console.log(
      "Tự động cập nhật dữ liệu..."
    );

    try {
      await updateAll();
      console.log(
        "Cập nhật thành công"
      );
    } catch (error) {
      console.error(
        error.message
      );
    }
  }
);

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "Vé Số Phát Đạt đang chạy tại cổng " +
      PORT
    );
  }
);
