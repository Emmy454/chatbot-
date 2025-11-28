import axios from "axios";
import dotenvConfig from "./dotenvConfig.js";

export async function sendWhatsAppMessage(to, message) {
  try {
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v19.0/${dotenvConfig.PHONE_NUMBER_ID}/messages`,
      headers: {
        Authorization: `Bearer ${dotenvConfig.WHATSAPP_TOKEN}`,
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
