const express = require("express");
const cheerio = require("cheerio");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, "data.json");
const SOURCE_URL = "https://sxmn.com.vn/";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

async function updateResults() {
  try {
    const response = await fetch(SOURCE_URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    const rows = [];

    $("table tr").each((i, el) => {
      const cells = $(el)
        .find("th,td")
        .map((_, c) => $(c).text().trim())
        .get();

      if (cells.length >= 2) {
        rows.push(cells);
      }
    });

    if (!rows.length) {
      console.log("Không tìm thấy dữ liệu.");
      return false;
    }

    const data = loadData();

    data.unshift({
      updatedAt: new Date().toISOString(),
      source: SOURCE_URL,
      rows
    });

    saveData(data.slice(0, 120));

    console.log("Đã cập nhật dữ liệu:", new Date().toLocaleString("vi-VN"));
    return true;
  } catch (error) {
    console.error("Lỗi cập nhật:", error.message);
    return false;
  }
}

app.get("/api/status", (req, res) => {
  const data = loadData();

  res.json({
    ok: true,
    name: "Vé Số Phát Đạt - Soi Cầu XSMN",
    updatedAt: data[0]?.updatedAt || null,
    totalDays: data.length
  });
});

app.get("/api/results", (req, res) => {
  res.json(loadData());
});

app.get("/api/analyze", (req, res) => {
  const data = loadData();

  res.json({
    ok: true,
    message:
      "Dữ liệu dùng để thống kê tham khảo. Kết quả xổ số là ngẫu nhiên.",
    totalDays: data.length,
    latest: data[0] || null
  });
});

app.post("/api/update", async (req, res) => {
  const ok = await updateResults();

  res.json({
    ok,
    message: ok ? "Đã cập nhật dữ liệu." : "Cập nhật thất bại."
  });
});

cron.schedule("*/30 * * * *", () => {
  updateResults();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Vé Số Phát Đạt đang chạy tại cổng ${PORT}`);
  updateResults();
});
