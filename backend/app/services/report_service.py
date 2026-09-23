class ReportService:
    def generate_report(
        self,
        interview_data: dict,
        answers_data: list[dict],
        score_data: dict,
        webcam_summary: dict | None = None
    ) -> dict:
        overall_score = float(score_data.get("overall_score", 0))
        communication_score = float(score_data.get("communication_score", 0))
        
        wpms = []
        for ans in answers_data:
            speech = ans.get("speech_analysis", {})
            if speech and speech.get("words_per_minute") is not None:
                wpms.append(speech["words_per_minute"])
        
        avg_wpm = sum(wpms) / len(wpms) if wpms else 0
        
        if overall_score >= 80:
            readiness = "Strong Hire"
        elif overall_score >= 60:
            readiness = "Potential Hire"
        else:
            readiness = "Needs Improvement"
            
        strengths = score_data.get("strengths", [])
        weaknesses = score_data.get("weaknesses", [])
        recommendations = score_data.get("recommendations", [])
        
        return {
            "Executive Summary": f"The candidate achieved an overall score of {overall_score:.1f}/100. They demonstrated {len(strengths)} key strengths and have {len(weaknesses)} areas for improvement.",
            "Communication": f"The communication score was {communication_score:.1f}/100. The candidate was {'articulate' if communication_score > 70 else 'understandable'}.",
            "Technical": f"The candidate successfully answered {len(answers_data)} interview questions covering various skills.",
            "Voice": f"The average speaking rate was {avg_wpm:.1f} words per minute.",
            "Body Language": f"Webcam engagement was {'recorded and analyzed' if webcam_summary else 'not analyzed in this session'}.",
            "Strengths": strengths,
            "Weaknesses": weaknesses,
            "Recommendations": recommendations,
            "Readiness": readiness,
        }
