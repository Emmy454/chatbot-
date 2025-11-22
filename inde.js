import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import ExcelJS from "exceljs";
import nodemailer from "nodemailer";
import cron from "node-cron";
import { google } from "googleapis";
import fs from "fs";

dotenv.config();
const app = express();
app.use(express.json());

const userSession = {};

// ✅ Database
const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: process.env.DB_PORT,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
console.log("✅ Connected to MySQL");

// ✅ Google Drive Auth
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN
});
const drive = google.drive({ version: "v3", auth: oauth2Client });

// ✅ Gmail Transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.ADMIN_EMAIL_PASS
  }
});

// ======================= WEBHOOKS ==========================

app.get("/", (req, res) => res.send("✅ WhatsApp Bot Live"));

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else res.sendStatus(403);
});

// ✅ IMPORTANT: Respond 200 immediately
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  setImmediate(async () => {
    try {
      const body = req.body;
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!message) return;
      await handleIncomingMessage(body);
    } catch (err) {
      console.error("❌ Webhook error:", err);
    }
  });
});

// ================= CHATBOT LOGIC ==========================

async function handleIncomingMessage(body) {
  const message = body.entry[0].changes[0].value.messages[0];
  const from = message.from;
  const userText = message.text?.body?.trim().toLowerCase() || "";
  const customerName = body.entry[0].changes[0].value.contacts?.[0]?.profile?.name || "Customer";

  if (!userSession[from])
    userSession[from] = { stage: "menu_sent", name: customerName };

  const greetings = ["hi", "hello", "hey", "start", "menu", "restart"];

  if (greetings.includes(userText)) {
    delete userSession[from];
    userSession[from] = { stage: "menu_sent", name: customerName };
    await sendWhatsAppMessage(from, `Hello ${customerName}! 👋 Welcome to Fundit Finance.`);
    return sendMenu(from);
  }

  if (userText === "0") {
    userSession[from] = { stage: "menu_sent", name: customerName };
    await sendWhatsAppMessage(from, "🔄 Returning to main menu...");
    return sendMenu(from);
  }
        
  // ✅ Complaint Name Step
  if (userSession[from].stage === "complaints_name") {
    userSession[from].customerName = message.text.body.trim();
    userSession[from].stage = "complaints_text";
    return sendWhatsAppMessage(from, "Please type your complaint.\n\n0 to return to menu");
  }

  // ✅ Complaint Text Step
  if (userSession[from].stage === "complaints_text") {
    const complaintText = message.text.body.trim();

    await db.execute(
      "INSERT INTO complaints (customer_name, phone_number, complaint) VALUES (?, ?, ?)",
      [userSession[from].customerName, from, complaintText]
    );

    await sendWhatsAppMessage(from, `✅ Thank you ${userSession[from].customerName}! Your complaint has been recorded.`);

    setTimeout(async () => {
      const file = await exportFile();
      await uploadToDrive(file);
      await sendEmailBackup(file);
    }, 150);

    delete userSession[from];
    return;
  }

  // ✅ Menu options
  if (userSession[from].stage === "menu_sent") {
    switch (userText) {
      case "1": return sendWhatsAppMessage(from, "\n1 Personal loans \n2 Public servant loans \n3 Asset finance \n4 LPO \n5 Invoice discounting \n0 return to main menu");
      case "2": return sendWhatsAppMessage(from, "\n1 Dollar invewstment \n2 Naira investment \n0 return to main menu");
      case "3": return sendWhatsAppMessage(from, "\n1 Loan liquidation \n2 Loan top-up \n3 Change repayment date \n4 Update personal details \n0 return to main menu");
      case "4": return sendWhatsAppMessage(from, " All general enquiries are in the website");
      case "5":
        userSession[from].stage = "complaints_name";
        return sendWhatsAppMessage(from, "📝 Please enter your full name:");
      default:
        return sendWhatsAppMessage(from, "⚠️ Invalid option. Reply 1–5 or 0 to return.");
    }
  }
}
 // 6) Handle loan submenu choices
  if (userSession[from].stage === "loan_menu") {
    if (userText === "0") {
      userSession[from] = { stage: "menu_sent" };
      await sendWhatsAppMenu(from);
      return;
    }
  // Accept numeric choices 1..n
    switch (userText) {
      case "1":
        userSession[from].loanType = "personal loan";
        userSession[from].stage = "loan_collect_details";
        await sendWhatsAppMessage(
          from,
          "You selected *Personal Loan*. Please provide:\n1) What do you do?\n2) Where do you work?\n3) How much do you want?\n4) For how long (months)?\n\nReply with the answers separated by lines."
        );
        return;

      case "2":
        userSession[from].loanType = "asset finance";
        userSession[from].stage = "loan_collect_details";
        await sendWhatsAppMessage(from, "You selected *Asset Finance*. Please send: what asset, amount, and duration (months).");
        return;

      case "3":
        userSession[from].loanType = "business loan";
        userSession[from].stage = "loan_collect_details";
        await sendWhatsAppMessage(from, "You selected *Business Loan*. Please provide business name, amount required, duration (months).");
        return;

      default:
        await sendWhatsAppMessage(from, "⚠️ Invalid option in loan menu. Reply 1,2,3 or 0 to go back.");
        return;
    }
     // 8) Investment submenu
  if (userSession[from].stage === "investment_menu") {
    if (userText === "0") {
      userSession[from] = { stage: "menu_sent" };
      await sendWhatsAppMenu(from);
      return;
    }

    if (userText === "1" || userText === "2") {
      userSession[from].investmentType = userText === "1" ? "dollar" : "naira";
      userSession[from].stage = "investment_amount";
      await sendWhatsAppMessage(from, `You chose ${userSession[from].investmentType} investment. How much would you like to invest? (enter numeric amount)`);
      return;
    }

    await sendWhatsAppMessage(from, "⚠️ Invalid option. Reply 1 or 2, or 0 for menu.");
    return;
  }

  if (userSession[from].stage === "investment_amount") {
    const amount = parseFloat(userText.replace(/[^0-9.]/g, ""));
    if (!amount || amount <= 0) {
      await sendWhatsAppMessage(from, "⚠️ Please enter a valid numeric amount (e.g., 5000).");
      return;
    }
    userSession[from].investmentAmount = amount;
    userSession[from].stage = "investment_duration";
    await sendWhatsAppMessage(from, "For how long do you want to invest?\n1) 3 months\n2) 6 months\n3) 12 months\n0 to cancel");
    return;
  }

  if (userSession[from].stage === "investment_duration") {
    const map = { "1": 3, "2": 6, "3": 12 };
    if (!map[userText]) {
      await sendWhatsAppMessage(from, "⚠️ Invalid option. Reply 1,2,3 or 0 to cancel.");
      return;
    }
    userSession[from].investmentDuration = map[userText];
    const symbol = userSession[from].investmentType === "dollar" ? "$" : "₦";
    await sendWhatsAppMessage(
      from,
      `💼 Summary:\nType: ${userSession[from].investmentType}\nAmount: ${symbol}${userSession[from].investmentAmount}\nDuration: ${userSession[from].investmentDuration} months\n\nReply YES to confirm or NO to cancel.`
    );
    userSession[from].stage = "investment_confirm";
    return;
  }

  if (userSession[from].stage === "investment_confirm") {
    if (userText === "yes" || userText === "y") {
      // save to db (optional)
      try {
        await db.execute(
          "INSERT INTO investments (phone_number, name, type, amount, duration_months) VALUES (?, ?, ?, ?, ?)",
          [
            from,
            userSession[from].name || "Unknown",
            userSession[from].investmentType,
            userSession[from].investmentAmount,
            userSession[from].investmentDuration,
          ]
        );
      } catch (e) {
        console.warn("Could not save investment (table might not exist):", e.message || e);
      }
      await sendWhatsAppMessage(from, "✅ Investment request received. Our investments team will contact you.");
      delete userSession[from];
      return;
    } else {
      await sendWhatsAppMessage(from, "⛔ Investment cancelled. Returning to main menu.");
      userSession[from] = { stage: "menu_sent" };
      await sendWhatsAppMenu(from);
      return;
    }
  }

  // 9) General enquiries (free text) — save or forward
  if (userSession[from].stage === "general_query") {
    const query = userTextRaw.trim();
    if (!query) {
      await sendWhatsAppMessage(from, "⚠️ Please type your question.");
      return;
    }

    try {
      await db.execute("INSERT INTO general_queries (phone_number, name, question) VALUES (?, ?, ?)", [
        from,
        userSession[from].name || "Unknown",
        query,
      ]);
    } catch (e) {
      console.warn("Could not save general query (table may not exist):", e.message || e);
    }

    await sendWhatsAppMessage(from, "✅ Thanks! We've received your question. Our support team will reply soon.");
    delete userSession[from];
    return;
  }

  // Fallback
  await sendWhatsAppMessage(from, "Sorry — I didn't understand. Reply 'menu' or 'start' to see options.");
  }

async function sendMenu(to) {
  await sendWhatsAppMessage(to,
`*How may we help you today?*

1 Loan enquiries  
2 Investment enquiries  
3 Are you with Digiit?  
4 General enquiries  
5 Submit a complaint  

_Reply with a number_`);
}

// ============== SEND WHATSAPP MESSAGE ====================

async function sendWhatsAppMessage(to, message) {
  try {
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      data: {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message }
      }
    });
  } catch (err) {
    console.error("❌ WhatsApp send error:", err.response?.data || err.message);
  }
}

// =============== BACKUP SYSTEM ============================

async function exportFile() {
  const [rows] = await db.execute(
    "SELECT id, customer_name, phone_number, complaint, created_at FROM complaints"
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Complaints");

  sheet.columns = [
    { header: "ID", key: "id", width: 10 },
    { header: "Name", key: "customer_name", width: 25 },
    { header: "Phone", key: "phone_number", width: 20 },
    { header: "Complaint", key: "complaint", width: 50 },
    { header: "Date", key: "created_at", width: 25 },
  ];

  rows.forEach((r) => sheet.addRow(r));

  const filePath = "./complaints_backup.xlsx";
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

async function uploadToDrive(filePath) {
  await drive.files.create({
    requestBody: {
      name: `complaints_${Date.now()}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    media: { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: fs.createReadStream(filePath) }
  });

  console.log("✅ Uploaded to Google Drive");
}

async function sendEmailBackup(filePath) {
  await transporter.sendMail({
    from: process.env.ADMIN_EMAIL,
    to: process.env.ADMIN_EMAIL,
    subject: "📊 WhatsApp Complaint Backup",
    text: "Attached is the latest complaint backup.",
    attachments: [{ filename: "complaints.xlsx", path: filePath }],
  });

  console.log("✅ Email backup sent");
}

// ✅ Cron — every 14 days at midnight
cron.schedule("0 0 */14 * *", () => {
  setTimeout(async () => {
    try {
      console.log("🕒 Running automatic backup...");
      const file = await exportFile();
      await uploadToDrive(file);
      await sendEmailBackup(file);
      console.log("✅ Auto backup completed");
    } catch (e) {
      console.error("❌ Auto backup failed:", e);
    }
  }, 200);
});

// ================= SERVER ================================
app.listen(3000, () => console.log("🚀 Bot running on port 3000"));
