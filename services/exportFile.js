import ExcelJS from "exceljs";
import { db } from "../config/db.js";

export async function exportFile() {
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
