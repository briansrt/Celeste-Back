const nodemailer = require("nodemailer");
const PDFDocument = require('pdfkit');
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail", // o cualquier otro como Mailgun, SendGrid, etc.
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async ({ to, subject, text, html }) => {
  const pdfBuffer = await generatePdfBuffer(text);
  await transporter.sendMail({
    from: `"Celeste 🌱" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
    attachments: [
      {
        filename: "historial.pdf",
        content: pdfBuffer,
      },
    ],
  });
};

const generatePdfBuffer = (content) => {
  return new Promise((resolve) => {
    const doc = new PDFDocument();
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(12).text(content, {
      align: "left",
    });

    doc.end();
  });
};

module.exports = sendEmail;
