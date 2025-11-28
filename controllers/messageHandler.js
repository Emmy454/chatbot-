import { db } from "../config/db.js";
import { userSession } from "../utils/session.js";
import { sendWhatsAppMessage } from "../config/whatsapp.js";
import { exportFile } from "../services/ exportFile.js";
import { uploadToDrive } from "../services/googleDriveUpload.js";
import { sendEmailBackup } from "../services/emailBackup.js";

export async function handleIncomingMessage(body) {
  const message = body.entry[0].changes[0].value.messages?.[0];
  if (!message) return;

  const from = message.from;
  const userTextRaw = message.text?.body?.trim() || "";
  const userText = userTextRaw.toLowerCase();
  const customerName = body.entry[0].changes[0].value.contacts?.[0]?.profile?.name || "Customer";

  // Initialize session
  if (!userSession[from])
    userSession[from] = { stage: "menu_sent", name: customerName };

  // === GREETINGS / RESET MENU ===
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

  // === COMPLAINT FLOW ===
  if (userSession[from].stage === "complaints_name") {
    userSession[from].customerName = userTextRaw;
    userSession[from].stage = "complaints_text";
    return sendWhatsAppMessage(from, "Please type your complaint.\n\n0 to return to menu");
  }

  if (userSession[from].stage === "complaints_text") {
    const complaintText = userTextRaw;
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

  // === MENU OPTIONS ===
  if (userSession[from].stage === "menu_sent") {
    switch (userText) {
      case "1":
        userSession[from].stage = "loan_menu";
        return sendWhatsAppMessage(from,
`*Loan Enquiries*\n1) Personal Loan\n2) Asset Finance\n3) Business Loan\n0) Return to main menu`);
      case "2":
        userSession[from].stage = "investment_menu";
        return sendWhatsAppMessage(from,
`*Investment Enquiries*\n1) Dollar Investment\n2) Naira Investment\n0) Return to main menu`);
      case "3":
        return sendWhatsAppMessage(from,
`*Are you with Digiit?*\n1) Loan liquidation\n2) Loan top-up\n3) Change repayment date\n4) Update personal details\n0) Return to main menu`);
      case "4":
        userSession[from].stage = "general_query";
        return sendWhatsAppMessage(from, "Please type your general enquiry.");
      case "5":
        userSession[from].stage = "complaints_name";
        return sendWhatsAppMessage(from, "📝 Please enter your full name for the complaint:");
      default:
        return sendWhatsAppMessage(from, "⚠️ Invalid option. Reply 1–5 or 0 to return.");
    }
  }

  // === LOAN MENU ===
  if (userSession[from].stage === "loan_menu") {
    if (userText === "0") {
      userSession[from] = { stage: "menu_sent" };
      return sendMenu(from);
    }

    const loanTypes = { "1": "personal loan", "2": "asset finance", "3": "business loan" };
    if (loanTypes[userText]) {
      userSession[from].loanType = loanTypes[userText];
      userSession[from].stage = "loan_collect_details";
      return sendWhatsAppMessage(from,
        `You selected *${loanTypes[userText]}*. Please provide required details separated by lines.\n\n0 to return to menu`
      );
    }

    return sendWhatsAppMessage(from, "⚠️ Invalid option in loan menu. Reply 1-3 or 0.");
  }

  if (userSession[from].stage === "loan_collect_details") {
    const details = userTextRaw.split("\n").map(d => d.trim());
    // Save details to DB
    await db.execute(
      "INSERT INTO loans (phone_number, name, loan_type, details) VALUES (?, ?, ?, ?)",
      [from, userSession[from].name || "Unknown", userSession[from].loanType, details.join(", ")]
    );

    await sendWhatsAppMessage(from, `✅ Your ${userSession[from].loanType} request has been received. Our team will contact you.`);
    delete userSession[from];
    return;
  }

  // === INVESTMENT MENU ===
  if (userSession[from].stage === "investment_menu") {
    if (userText === "0") { userSession[from].stage = "menu_sent"; return sendMenu(from); }

    if (userText === "1" || userText === "2") {
      userSession[from].investmentType = userText === "1" ? "dollar" : "naira";
      userSession[from].stage = "investment_amount";
      return sendWhatsAppMessage(from, `You chose ${userSession[from].investmentType} investment. Enter amount:`);
    }

    return sendWhatsAppMessage(from, "⚠️ Invalid option. Reply 1 or 2, or 0 to cancel.");
  }

  if (userSession[from].stage === "investment_amount") {
    const amount = parseFloat(userText.replace(/[^0-9.]/g, ""));
    if (!amount || amount <= 0) return sendWhatsAppMessage(from, "⚠️ Enter a valid numeric amount.");
    userSession[from].investmentAmount = amount;
    userSession[from].stage = "investment_duration";
    return sendWhatsAppMessage(from, "Select duration:\n1) 3 months\n2) 6 months\n3) 12 months\n0 to cancel");
  }

  if (userSession[from].stage === "investment_duration") {
    const map = { "1": 3, "2": 6, "3": 12 };
    if (!map[userText]) return sendWhatsAppMessage(from, "⚠️ Invalid option. Reply 1-3 or 0.");
    userSession[from].investmentDuration = map[userText];
    userSession[from].stage = "investment_confirm";

    const symbol = userSession[from].investmentType === "dollar" ? "$" : "₦";
    return sendWhatsAppMessage(from,
      `💼 Summary:\nType: ${userSession[from].investmentType}\nAmount: ${symbol}${userSession[from].investmentAmount}\nDuration: ${userSession[from].investmentDuration} months\nReply YES to confirm or NO to cancel.`
    );
  }

  if (userSession[from].stage === "investment_confirm") {
    if (["yes", "y"].includes(userText)) {
      await db.execute(
        "INSERT INTO investments (phone_number, name, type, amount, duration_months) VALUES (?, ?, ?, ?, ?)",
        [
          from,
          userSession[from].name || "Unknown",
          userSession[from].investmentType,
          userSession[from].investmentAmount,
          userSession[from].investmentDuration
        ]
      );
      await sendWhatsAppMessage(from, "✅ Investment request received. Our team will contact you.");
      delete userSession[from];
      return;
    } else {
      userSession[from].stage = "menu_sent";
      await sendWhatsAppMessage(from, "⛔ Investment cancelled. Returning to main menu.");
      return sendMenu(from);
    }
  }

  // === GENERAL QUERY ===
  if (userSession[from].stage === "general_query") {
    if (!userTextRaw) return sendWhatsAppMessage(from, "⚠️ Please type your question.");

    await db.execute(
      "INSERT INTO general_queries (phone_number, name, question) VALUES (?, ?, ?)",
      [from, userSession[from].name || "Unknown", userTextRaw]
    );

    await sendWhatsAppMessage(from, "✅ Your question has been received. Our team will reply soon.");
    delete userSession[from];
    return;
  }

  // === FALLBACK ===
  await sendWhatsAppMessage(from, "Sorry — I didn't understand. Reply 'menu' or 'start' to see options.");
}

// === MENU HELPER ===
export async function sendMenu(to) {
  await sendWhatsAppMessage(to,
`*How may we help you today?*

1 Loan enquiries  
2 Investment enquiries  
3 Are you with Digiit?  
4 General enquiries  
5 Submit a complaint  

_Reply with a number_`);
}
