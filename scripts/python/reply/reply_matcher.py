from __future__ import annotations

import re
from typing import Any


def extract_domain(email_str: str | None) -> str | None:
    if not email_str:
        return None
    match = re.search(r"@([\w.-]+)", email_str)
    return match.group(1).lower() if match else None


def normalize_str(value: str | None) -> str:
    return re.sub(r"\s+", "", value or "").lower()


def normalize_chinese(value: str | None) -> str:
    return (value or "").replace("有限公司", "").replace("公司", "").replace("股份", "").replace("集团", "").strip()


def check_company_match(text: str | None, company: str | None) -> bool:
    if not company or not text:
        return False
    if company in text:
        return True
    if company.lower() in text.lower():
        return True
    text_norm = normalize_str(text)
    company_norm = normalize_str(company)
    if len(company_norm) > 2 and company_norm in text_norm:
        return True
    chinese = normalize_chinese(company)
    return bool(chinese and len(chinese) >= 2 and chinese in text)


def check_role_match(text: str | None, role: str | None) -> bool:
    if not role or not text:
        return False
    text_norm = normalize_str(text)
    role_norm = normalize_str(role)
    if role_norm in text_norm:
        return True
    for part in re.split(r"[\s_\\/()-]+", role):
        if len(part) > 3 and normalize_str(part) in text_norm:
            return True
    clean_role = re.sub(r"[\s_\\/()-]+", "", role)
    return len(clean_role) > 2 and clean_role.lower() in text_norm


def get_app_domains(app: dict[str, Any], followups: list[dict[str, Any]]) -> list[str]:
    domains: set[str] = set()
    notes = app.get("notes") or ""
    for email in re.findall(r"[\w.-]+@[\w.-]+\.\w+", notes):
        if domain := extract_domain(email):
            domains.add(domain)
    for word in notes.split():
        if "." in word and "@" not in word:
            domains.add(re.sub(r"[^a-z0-9.-]", "", word.lower()))
    for followup in [item for item in followups if item.get("appNum") == app.get("num")]:
        if domain := extract_domain(followup.get("contact")):
            domains.add(domain)
        for email in re.findall(r"[\w.-]+@[\w.-]+\.\w+", followup.get("notes") or ""):
            if domain := extract_domain(email):
                domains.add(domain)
    company_norm = normalize_str(app.get("company"))
    if company_norm:
        domains.update({f"{company_norm}.com", f"{company_norm}.co", f"{company_norm}.io"})
    return [domain for domain in domains if domain]


def match_candidates(candidates: list[dict[str, Any]], apps: list[dict[str, Any]], followups: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    followups = followups or []
    results: list[dict[str, Any]] = []
    for candidate in candidates:
        context = f"{candidate.get('from') or ''} {candidate.get('subject') or ''} {candidate.get('body_snippet') or ''}"
        from_domain = extract_domain(candidate.get("from"))
        best_matches: list[dict[str, Any]] = []
        highest = -1.0
        for app in apps:
            score = 0.0
            signals: list[str] = []
            company_hint = ""
            role_hint = ""
            is_company = check_company_match(context, app.get("company"))
            if is_company:
                score += 2
                signals.append("company-name")
                company_hint = app.get("company") or ""
            is_role = check_role_match(context, app.get("role"))
            if is_role:
                score += 1.5
                signals.append("role-title")
                role_hint = app.get("role") or ""
            has_domain = False
            if from_domain:
                app_domains = get_app_domains(app, followups)
                if any(from_domain == domain or from_domain.endswith(f".{domain}") for domain in app_domains):
                    has_domain = True
                    score += 2
                    signals.append("sender-domain")
                    company_hint = company_hint or app.get("company") or ""
            post_keywords = ["interview", "offer", "rejection", "邀您面试", "简历通过", "next steps", "update on your application"]
            strong = ["interview_invite", "offer", "rejection"]
            has_post = candidate.get("signal") in strong or any(keyword.lower() in context.lower() for keyword in post_keywords)
            if has_post and (is_company or has_domain):
                signals.append("post-application-keyword")
            if score > 0:
                if (is_company or has_domain) and is_role:
                    confidence = "high"
                elif (is_company or has_domain) and has_post:
                    confidence = "high"
                elif is_company or has_domain:
                    confidence = "medium"
                else:
                    confidence = "low"
                info = {
                    "message_id": candidate.get("message_id"),
                    "company_hint": company_hint or app.get("company"),
                    "role_hint": role_hint or app.get("role"),
                    "application_num": app.get("num"),
                    "confidence": confidence,
                    "signals": list(dict.fromkeys(signals)),
                    "score": score,
                }
                if score > highest:
                    highest = score
                    best_matches = [info]
                elif score == highest:
                    best_matches.append(info)
        if len(best_matches) == 1:
            match = dict(best_matches[0])
            match.pop("score", None)
            results.append(match)
        elif len(best_matches) > 1:
            results.append({"message_id": candidate.get("message_id"), "company_hint": candidate.get("from"), "role_hint": "", "application_num": None, "confidence": "low", "signals": ["ambiguous-match"]})
        else:
            results.append({"message_id": candidate.get("message_id"), "company_hint": from_domain or candidate.get("from"), "role_hint": "", "application_num": None, "confidence": "low", "signals": ["no-match"]})
    return results


def _unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def classify_reply(candidate: dict[str, Any]) -> dict[str, Any]:
    text = f"{candidate.get('from') or ''} {candidate.get('subject') or ''} {candidate.get('body_snippet') or ''}"
    text_lower = text.lower()
    signal = candidate.get("signal") or ""
    evidence: list[str] = []

    def check(keywords: list[str]) -> bool:
        found = False
        for keyword in keywords:
            if keyword.lower() in text_lower:
                evidence.append(keyword)
                found = True
        return found

    noise = ["邀请投递", "抢面试先机", "近期热招", "立即投递", "热招职位", "订阅职位", "职位推荐", "推荐职位", "job alert", "invitation to apply", "recommended jobs", "newsletter", "marketing digest", "job recommendation", "suggested jobs"]
    offer = ["录取通知书", "录用信", "录用通知", "录用", "薪资确认", "入职协议", "意向书", "offer letter", "employment agreement", "job offer", "congratulations on the offer", "compensation details", "offer"]
    rejection = ["很遗憾", "暂不匹配", "不合适", "未能进入下一轮", "感谢您的时间", "未通过", "不再考虑", "决定不推进", "unfortunately", "not a match", "not matching", "decided not to proceed", "will not be moving forward", "position has been filled", "role has been closed", "unable to offer"]
    auto = ["自动回复", "收到您的申请", "申请已收到", "投递成功", "确认收到", "thank you for applying", "application received", "received your application", "auto-confirmation", "confirmation of application", "automatic reply"]
    action = ["补充信息", "提供信息", "完成测评", "在线测评", "笔试题", "做个测试", "截止日期前", "截止时间", "complete a form", "provide information", "finish an assessment", "coding challenge", "online test", "respond by a deadline", "pick a time", "schedule a time", "book a time", "complete assessment", "take a test", "assessment", "coding test", "deadline", "fill out", "complete the form", "provide details", "submit info"]
    interview = ["邀您面试", "邀约面试", "微信小程序面试", "AI微信小程序", "面试形式", "面试时间", "面试时长", "安排面试", "预约面试", "首轮面试", "视频面试", "电话面试", "现场面试", "面试邀请", "面试流程", "简历通过", "interview invitation", "schedule an interview", "scheduling link", "ai interview", "video interview", "phone screen", "onsite interview", "final round", "invite you to interview", "interview request", "interview schedule"]
    responded = ["联系您", "回复您", "想沟通", "想聊聊", "进一步沟通", "would like to chat", "reach out", "connect with you", "hiring manager responded"]

    if check(noise):
        return {"type": "Noise", "evidence": _unique(evidence), "suggestedTrackerUpdate": "none"}
    if signal == "offer" or check(offer):
        if signal == "offer" and "offer" not in evidence:
            evidence.append("offer")
        return {"type": "Offer", "evidence": _unique(evidence), "suggestedTrackerUpdate": "Offer"}
    if signal == "rejection" or check(rejection):
        if signal == "rejection" and "rejection" not in evidence:
            evidence.append("rejection")
        return {"type": "Rejected", "evidence": _unique(evidence), "suggestedTrackerUpdate": "Rejected"}
    if check(auto):
        return {"type": "Auto-confirmation", "evidence": _unique(evidence), "suggestedTrackerUpdate": "none"}
    if check(action):
        scheduling = any(term in text_lower for term in ["schedule", "pick a time", "book a time", "book a slot", "choose a time", "select a time", "appointment"]) or any(term in text for term in ["预约", "选择时间", "选择面试", "安排时间"])
        return {"type": "Need Action", "evidence": _unique(evidence), "suggestedTrackerUpdate": "Interview" if scheduling else "Responded"}
    if signal == "interview_invite" or check(interview):
        if signal == "interview_invite" and "interview_invite" not in evidence:
            evidence.append("interview_invite")
        return {"type": "Interview", "evidence": _unique(evidence), "suggestedTrackerUpdate": "Interview"}
    if signal == "update" or check(responded):
        if signal == "update" and "update" not in evidence:
            evidence.append("update")
        return {"type": "Responded", "evidence": _unique(evidence), "suggestedTrackerUpdate": "Responded"}
    recruiting = ["application", "career", "job", "recruiter", "hiring", "interview", "resume", "简历", "职位", "招聘", "应聘"]
    if any(term.lower() in text_lower for term in recruiting):
        return {"type": "Unknown", "evidence": [], "suggestedTrackerUpdate": "Needs Review"}
    return {"type": "Unknown", "evidence": [], "suggestedTrackerUpdate": "Needs Review"}

