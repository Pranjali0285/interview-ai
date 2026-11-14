const pdfParse = require("pdf-parse");
const { generateInterviewReport, generateResumePdf } = require("../services/ai.service");
const interviewReportModel = require("../models/interviewReport.model");

async function generateInterviewReportController(req, res, next) {
    try {
        let resumeText = "";

        if (req.file) {
            try {
                const parsedResume = await (
                    new pdfParse.PDFParse(
                        Uint8Array.from(req.file.buffer)
                    )
                ).getText();
                resumeText = parsedResume.text || "";
            } catch (pdfErr) {
                console.error("PDF Parsing error:", pdfErr);
                return res.status(400).json({
                    message: "Failed to parse resume PDF. Please check the uploaded file.",
                });
            }
        }

        const { selfDescription, jobDescription } = req.body;

        if (!jobDescription || (!resumeText && !selfDescription)) {
            return res.status(400).json({
                message: "Job description and at least a resume or self-description are required.",
            });
        }

        const userId = req.id || req.user?.id;

        const interviewReportByAI = await generateInterviewReport({
            resume: resumeText,
            selfDescription,
            jobDescription,
        });

        const interviewReport = await interviewReportModel.create({
            user: userId,
            resume: resumeText,
            selfDescription,
            jobDescription,
            ...interviewReportByAI,
        });

        return res.status(201).json({
            message: "Interview report generated successfully",
            interviewReport,
        });
    } catch (error) {
        next(error);
    }
}

async function getInterviewReportByIdController(req, res, next) {
    try {
        const { interviewId } = req.params;
        const userId = req.id || req.user?.id;

        const interviewReport = await interviewReportModel.findOne({
            _id: interviewId,
            user: userId,
        });

        if (!interviewReport) {
            return res.status(404).json({
                message: "Interview report not found.",
            });
        }

        return res.status(200).json({
            message: "Interview report retrieved successfully",
            interviewReport,
        });
    } catch (error) {
        next(error);
    }
}

async function getAllInterviewReportsController(req, res, next) {
    try {
        const userId = req.id || req.user?.id;

        const interviewReports = await interviewReportModel
            .find({ user: userId })
            .sort({ createdAt: -1 })
            .select("-resume -selfDescription -jobDescription -__v -technicalQuestions -behavioralQuestions -skillGaps -preparationPlan");

        return res.status(200).json({
            message: "All interview reports retrieved successfully",
            interviewReports,
        });
    } catch (error) {
        next(error);
    }
}

async function generateResumePdfController(req, res, next) {
    try {
        const { interviewReportId } = req.params;
        const userId = req.id || req.user?.id;

        const interviewReport = await interviewReportModel.findOne({
            _id: interviewReportId,
            user: userId,
        });

        if (!interviewReport) {
            return res.status(404).json({
                message: "Interview report not found.",
            });
        }

        const { resume, jobDescription, selfDescription } = interviewReport;

        const pdfBuffer = await generateResumePdf({ resume, jobDescription, selfDescription });

        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename=resume_${interviewReportId}.pdf`,
        });

        return res.send(pdfBuffer);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    generateInterviewReportController,
    getInterviewReportByIdController,
    getAllInterviewReportsController,
    generateResumePdfController,
};
