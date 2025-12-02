export default function handler(req, res) {
  // GET request → Meta webhook verification
  if (req.method === "GET") {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }

  // POST request → receiving messages
  if (req.method === "POST") {
    console.log("Webhook event received:", req.body);
    return res.status(200).send("EVENT_RECEIVED");
  }

  // Unsupported method
  return res.sendStatus(405);
}
