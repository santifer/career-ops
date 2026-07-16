import json
from pathlib import Path

from scripts.python.cv.build_html import render_file as render_html_file
from scripts.python.cv.build_html import render_html, sanitize_url
from scripts.python.cv.build_latex import escape_latex, render_file as render_latex_file
from scripts.python.cv.build_latex import render_latex, sanitize_url as sanitize_latex_url
from scripts.python.cv.generate_latex import (
    cleanup_aux_files,
    compile_latex_file,
    extract_latex_error,
    validate_latex_content,
)
from scripts.python.cv.generate_cover_letter import (
    as_url,
    build_achievements_block,
    build_contact_line,
    build_footnotes_block,
    build_html as build_cover_html,
    default_output_path,
    generate_cover_letter_pdf,
    require_fields,
    resolve_cover_template_path,
    safe_output_path,
)
from scripts.python.cv.generate_pdf import (
    count_pdf_pages,
    extract_rendered_section_order,
    extract_source_section_order,
    generate_pdf,
    inject_print_page_css,
    inline_local_fonts,
    normalize_text_for_ats,
    repo_relative_manifest_path,
    render_html_to_pdf,
    update_pdf_manifest,
    validate_cv_section_order,
)
from scripts.python.cv.latex_content import (
    apply_patches,
    build_manifest,
    detect_family,
    find_matching_brace,
)
from scripts.python.cv.patch_latex_content import patch_latex_content
from scripts.python.cv.templates import (
    kebab,
    list_templates,
    load_profile_default,
    parse_meta,
    prettify,
    resolve_template,
    validate_template,
)
from scripts.python.cv.verify_cv_facts import metric_claims, strip_markup, verify_cv_facts


def html_template() -> str:
    return """<html lang="{{LANG}}">
<body style="width:{{PAGE_WIDTH}}">
{{PHOTO}}
<h1>{{NAME}}</h1>
<div class="contact-row">{{EMAIL}}</div>
<h2>{{SECTION_SUMMARY}}</h2><p>{{SUMMARY_TEXT}}</p>
<h2>{{SECTION_COMPETENCIES}}</h2>{{COMPETENCIES}}
<h2>{{SECTION_EXPERIENCE}}</h2>{{EXPERIENCE}}
<h2>{{SECTION_PROJECTS}}</h2>{{PROJECTS}}
<h2>{{SECTION_EDUCATION}}</h2>{{EDUCATION}}
<h2>{{SECTION_CERTIFICATIONS}}</h2>{{CERTIFICATIONS}}
<h2>{{SECTION_SKILLS}}</h2>{{SKILLS}}
</body></html>"""


def latex_template() -> str:
    return r"""\name{{NAME}}
\contact{{CONTACT_LINE}}
\href{{EMAIL_URL}}{{EMAIL_DISPLAY}}
\href{{LINKEDIN_URL}}{{LINKEDIN_DISPLAY}}
\href{{GITHUB_URL}}{{GITHUB_DISPLAY}}
{{EDUCATION}}
{{EXPERIENCE}}
{{PROJECTS}}
{{SKILLS}}
"""


def valid_tex() -> str:
    return r"""
\documentclass{article}
\input{glyphtounicode}
\pdfgentounicode=1
\newcommand{\resumeSubheading}[4]{#1 #2 #3 #4}
\newcommand{\resumeItem}[1]{#1}
\newcommand{\resumeProjectHeading}[2]{#1 #2}
\begin{document}
\section{Education}
\resumeSubheading{Uni}{Paris}{MSc}{2020}
\section{Work Experience}
\resumeSubheading{Acme}{2024}{Engineer}{Remote}
\resumeItem{Built platform}
\section{Projects}
\resumeProjectHeading{Tool}{2025}
\section{Skills}
\textbf{Languages}{: Python}
\end{document}
"""


def html_payload():
    return {
        "lang": "en",
        "page_format": "a4",
        "candidate": {
            "name": "Ada & Co",
            "email": "ada@example.com",
            "linkedin": {"url": "linkedin.com/in/ada", "display": "LinkedIn"},
            "portfolio": {"url": "javascript:alert(1)", "display": "Bad"},
            "location": "Paris",
            "photo": "https://example.com/photo.jpg",
        },
        "summary": 'R&D engineer with "impact"',
        "competencies": ["Python & AI"],
        "experience": [{"company": "Acme", "role": "Engineer", "dates": "2024", "bullets": ["Built <systems>"]}],
        "projects": [{"name": "Project", "badge": "OSS", "description": "Shipped 90% tests", "tech": "Python"}],
        "education": [{"title": "MSc", "org": "Uni", "year": "2020", "description": "AI"}],
        "certifications": [{"title": "Cert", "org": "Org", "year": "2021"}],
        "skills": [{"category": "Languages", "items": ["Python", "SQL"]}],
    }


def latex_payload():
    return {
        "name": "Ada & Co",
        "contact_line": "Paris | Remote",
        "email": {"url": "ada@example.com", "display": "ada@example.com"},
        "linkedin": {"url": "https://linkedin.com/in/ada", "display": "linkedin"},
        "github": {"url": "github.com/ada", "display": "github"},
        "education": [{"institution": "Uni", "location": "Paris", "degree": "MSc AI", "dates": "2020", "coursework": ["ML & Stats"]}],
        "experience": [{"company": "Acme", "role": "Engineer", "location": "Remote", "dates": "2024", "bullets": ["Saved 50% cost"]}],
        "projects": [{"name": "Tool", "context": "Python", "dates": "2025", "bullets": ["A → B"]}],
        "skills": [{"category": "Languages", "items": ["Python", "SQL"]}],
    }


def test_template_resolution_and_metadata(tmp_path):
    templates = tmp_path / "templates"
    templates.mkdir()
    (templates / "cv-template.html").write_text(
        "<!-- career-ops-template\nname: Base CV\n-->{{NAME}}{{EXPERIENCE}}{{EDUCATION}}",
        encoding="utf-8",
    )
    (templates / "cv-template.modern.html").write_text("{{NAME}}{{EXPERIENCE}}{{EDUCATION}}", encoding="utf-8")
    (templates / "cv-template.tex").write_text("{{NAME}}", encoding="utf-8")
    (templates / "cover-letter-template.html").write_text("{{NAME}}{{ROLE_TITLE}}{{OPENING}}", encoding="utf-8")
    profile = tmp_path / "profile.yml"
    profile.write_text("cv:\n  template: modern\n", encoding="utf-8")

    assert prettify("modern-cv") == "Modern Cv"
    assert kebab(" Modern CV! ") == "modern-cv"
    assert parse_meta(templates / "cv-template.html")["name"] == "Base CV"
    assert [item["name"] for item in list_templates("cv", directory=templates)] == ["modern", "standard"]
    assert validate_template(templates / "cv-template.html", "cv") == {"ok": True, "missing": []}
    assert load_profile_default("cv", profile_path=profile) == "modern"
    assert resolve_template("cv", None, directory=templates, profile_path=profile).name == "cv-template.modern.html"
    assert resolve_template("cv", "missing", directory=templates, fallback=True).name == "cv-template.html"


def test_html_rendering_escapes_and_drops_unsafe_urls(tmp_path):
    html = render_html(html_template(), html_payload())

    assert 'lang="en"' in html
    assert "210mm" in html
    assert "Ada &amp; Co" in html
    assert "R&amp;D engineer with &quot;impact&quot;" in html
    assert "Built &lt;systems&gt;" in html
    assert "javascript:" not in html
    assert "https://linkedin.com/in/ada" in html
    assert "{{" not in html
    assert sanitize_url("data:text/html,bad") == ""
    assert sanitize_url("ada@example.com") == "mailto:ada@example.com"

    input_path = tmp_path / "payload.json"
    output_path = tmp_path / "out" / "cv.html"
    template_path = tmp_path / "template.html"
    input_path.write_text(json.dumps(html_payload()), encoding="utf-8")
    template_path.write_text(html_template(), encoding="utf-8")
    report = render_html_file(input_path, output_path, template_path)
    assert report["valid"] is True
    assert report["counts"]["totalBullets"] == 1
    assert output_path.exists()


def test_latex_rendering_escapes_and_reports(tmp_path):
    rendered = render_latex(latex_template(), latex_payload())

    assert "Ada \\& Co" in rendered
    assert "ML \\& Stats" in rendered
    assert "Saved 50\\% cost" in rendered
    assert "$\\rightarrow$" in rendered
    assert "mailto:ada@example.com" in rendered
    assert "https://github.com/ada" in rendered
    assert "{{" not in rendered

    assert escape_latex(r"a_b & 50%") == r"a\_b \& 50\%"
    assert sanitize_latex_url("javascript:alert(1)") == "https://javascript:alert(1)"
    assert sanitize_latex_url("https://x.test/a#b") == "https://x.test/ab"

    input_path = tmp_path / "payload.json"
    output_path = tmp_path / "cv.tex"
    template_path = tmp_path / "template.tex"
    input_path.write_text(json.dumps(latex_payload()), encoding="utf-8")
    template_path.write_text(latex_template(), encoding="utf-8")
    report = render_latex_file(input_path, output_path, template_path=template_path)
    assert report["valid"] is True
    assert report["counts"]["totalBullets"] == 2
    assert output_path.exists()


def test_rendering_fails_on_unresolved_placeholders():
    try:
        render_html("{{NAME}}{{UNKNOWN}}", {"candidate": {"name": "Ada"}})
    except ValueError as error:
        assert "{{UNKNOWN}}" in str(error)
    else:
        raise AssertionError("unresolved HTML placeholder accepted")

    try:
        render_latex("{{NAME}}{{UNKNOWN}}", {"name": "Ada"})
    except ValueError as error:
        assert "{{UNKNOWN}}" in str(error)
    else:
        raise AssertionError("unresolved LaTeX placeholder accepted")


def test_latex_content_extracts_and_patches_resume_subheading(tmp_path):
    tex = r"""
\resumeSubheading{Acme}{2024}{Engineer}{Remote}
\resumeItemListStart
  \resumeItem{Built API with 50\% coverage}
  \resumeItem{Scaled pipelines}
\resumeItemListEnd
\textbf{Languages}{: Python, SQL}
"""
    assert detect_family(tex) == "resumeSubheading"
    assert find_matching_brace(r"\x{a\{b\}c}", 2) == len(r"\x{a\{b\}c}") - 1
    manifest = build_manifest("resume.tex", tex)

    assert manifest["supported"] is True
    assert [slot["id"] for slot in manifest["slots"]] == ["bullet-0", "bullet-1", "skill-0"]
    assert manifest["slots"][0]["text"] == r"Built API with 50\% coverage"

    patched = apply_patches(
        tex,
        [{"id": "bullet-0", "text": "Improved R&D by 25%"}, {"id": "skill-0", "text": "Python & SQL"}],
        manifest["slots"],
    )
    assert "Improved R\\&D by 25\\%" in patched
    assert "Python \\& SQL" in patched

    source = tmp_path / "resume.tex"
    patches = tmp_path / "patches.json"
    output = tmp_path / "out" / "resume.tex"
    source.write_text(tex, encoding="utf-8")
    patches.write_text(json.dumps({"slots": manifest["slots"], "patches": [{"id": "bullet-1", "text": "Owned AI platform"}]}), encoding="utf-8")
    report = patch_latex_content(source, patches, output)
    assert report["patched"] == 1
    assert "Owned AI platform" in output.read_text(encoding="utf-8")

    patches.write_text(json.dumps({"slots": manifest["slots"], "patches": [{"id": "missing", "text": "x"}]}), encoding="utf-8")
    try:
        patch_latex_content(source, patches, output)
    except ValueError as error:
        assert "Unknown patch ids: missing" in str(error)
    else:
        raise AssertionError("unknown patch id accepted")


def test_latex_content_extracts_tabularx_items_and_unsupported():
    tex = r"""
\usepackage{tabularx}
\begin{document}
\begin{itemize}
\item First plain item
\item{Second {nested} item}
\end{itemize}
\end{document}
"""
    manifest = build_manifest("resume.tex", tex)

    assert detect_family(tex) == "tabularx-itemize"
    assert [slot["text"] for slot in manifest["slots"]] == ["First plain item", "Second {nested} item"]
    assert build_manifest("bad.tex", r"\section{Experience}")["supported"] is False


def test_verify_cv_facts_flags_invented_metrics_and_forbidden_phrases(tmp_path):
    (tmp_path / "cv.md").write_text("Reduced latency by 30% and supported 12 teams.", encoding="utf-8")
    (tmp_path / "article-digest.md").write_text("Handled $2M budget.", encoding="utf-8")
    target = tmp_path / "generated.html"
    target.write_text(
        "<html><script>999 users</script><body>Reduced latency by 30%. Served 500 users. secret phrase.</body></html>",
        encoding="utf-8",
    )
    config = tmp_path / "cv-facts.json"
    config.write_text(json.dumps({"allow_metrics": ["500 users"], "forbidden_phrases": ["secret phrase"]}), encoding="utf-8")

    assert "999 users" not in strip_markup(target.read_text(encoding="utf-8"))
    assert "30%" in metric_claims(target.read_text(encoding="utf-8"))
    result = verify_cv_facts(target, sources=["cv.md", "article-digest.md"], config_path=config, cwd=tmp_path)
    assert result["ok"] is False
    assert result["invented"] == []
    assert result["forbidden"] == ["secret phrase"]

    target.write_text("<body>Improved 2x throughput.</body>", encoding="utf-8")
    result = verify_cv_facts(target, sources=["cv.md"], config_path=config, cwd=tmp_path)
    assert result["ok"] is False
    assert result["invented"] == ["2x"]

    target.write_text("<body>Reduced latency by 30%.</body>", encoding="utf-8")
    assert verify_cv_facts(target, sources=["cv.md"], config_path=config, cwd=tmp_path)["ok"] is True


def test_generate_latex_validation_modes():
    result = validate_latex_content(valid_tex())
    assert result["issues"] == []
    assert result["counts"] == {"resumeItems": 1, "subheadings": 3, "projectHeadings": 2}

    bad = validate_latex_content(r"\begin{document}日本語{{NAME}}\end{document}")
    assert any("Expected at least" in issue for issue in bad["issues"])
    assert any("CJK characters" in issue for issue in bad["issues"])
    assert any("Unresolved placeholders" in issue for issue in bad["issues"])

    compile_only = validate_latex_content(r"\begin{document}\end{document}", compile_only=True)
    assert compile_only == {
        "issues": [],
        "counts": {"resumeItems": 0, "subheadings": 0, "projectHeadings": 0},
    }


def test_generate_latex_reports_no_engine(tmp_path):
    tex = tmp_path / "cv.tex"
    tex.write_text(valid_tex(), encoding="utf-8")

    def runner(_args, _cwd, _timeout):
        raise FileNotFoundError("missing")

    report = compile_latex_file(tex, runner=runner)
    assert report["valid"] is True
    assert report["compiled"] is False
    assert "No LaTeX engine found" in report["compileError"]


def test_generate_latex_simulates_pdflatex_and_cleans_aux(tmp_path):
    tex = tmp_path / "cv.tex"
    tex.write_text(valid_tex(), encoding="utf-8")
    output = tmp_path / "out" / "cv.pdf"
    calls = []

    def runner(args, cwd, _timeout):
        calls.append(args)
        if args[:2] == ["pdflatex", "-no-shell-escape"]:
            (cwd / "cv.pdf").write_bytes(b"%PDF-1.4 /Type /Page\n")
            (cwd / "cv.aux").write_text("aux", encoding="utf-8")
            (cwd / "cv.log").write_text("log", encoding="utf-8")
        return None

    report = compile_latex_file(tex, output_path=output, runner=runner, engine="pdflatex")

    assert report["compiled"] is True
    assert report["engine"] == "pdflatex"
    assert report["pdf"]["path"] == str(output.resolve(strict=False))
    assert output.exists()
    assert not (tmp_path / "cv.aux").exists()
    assert not (tmp_path / "cv.log").exists()
    assert len([call for call in calls if call and call[0] == "pdflatex"]) == 2


def test_generate_latex_simulates_tectonic_patch_and_error_log(tmp_path):
    tex = tmp_path / "cv.tex"
    tex.write_text(valid_tex(), encoding="utf-8")

    def runner(args, cwd, _timeout):
        if args[0] == "tectonic":
            assert "._tectonic.tex" in args[-1]
            patched = (cwd / "cv._tectonic.tex").read_text(encoding="utf-8")
            assert r"\pdfgentounicode=1" not in patched
            (cwd / "cv._tectonic.pdf").write_bytes(b"%PDF")
        return None

    report = compile_latex_file(tex, runner=runner, engine="tectonic")
    assert report["compiled"] is True
    assert report["engine"] == "tectonic"
    assert not (tmp_path / "cv._tectonic.tex").exists()

    log = tmp_path / "cv.log"
    log.write_text("ok\n! Undefined control sequence\nmore\n! Emergency stop", encoding="utf-8")
    assert extract_latex_error(log, "fallback") == "! Undefined control sequence\n! Emergency stop"
    (tmp_path / "cv.aux").write_text("aux", encoding="utf-8")
    cleanup_aux_files(tmp_path, "cv")
    assert not (tmp_path / "cv.aux").exists()


def test_generate_pdf_normalizes_ats_text_without_touching_script_or_style():
    html = """<html><head><style>.x{content:"—"}</style></head>
<body>Senior — AI “Engineer” with 10 years → impact • **Lead** €100</body>
<script>const x = "—";</script></html>"""
    result = normalize_text_for_ats(html)

    assert '<style>.x{content:"—"}</style>' in result["html"]
    assert '<script>const x = "—";</script>' in result["html"]
    assert 'Senior - AI "Engineer" with 10 years to impact | <strong>Lead</strong> EUR 100' in result["html"]
    assert result["replacements"]["em-dash"] == 1
    assert result["replacements"]["smart-double-quote"] == 2
    assert result["replacements"]["nbsp"] == 1
    assert result["replacements"]["right-arrow"] == 1
    assert result["replacements"]["bullet"] == 1
    assert result["replacements"]["markdown-bold"] == 1


def test_generate_pdf_section_order_and_css_helpers():
    html = """
<div class="section-title">Work Experience</div>
<div class="section-title"><b>Projects</b></div>
<div class="section-title">Education</div>
"""
    markdown = "# Work Experience\n# Education\n# Projects\n"

    assert [section["key"] for section in extract_rendered_section_order(html)] == ["experience", "projects", "education"]
    assert [section["key"] for section in extract_source_section_order(markdown)] == ["experience", "education", "projects"]
    try:
        validate_cv_section_order(html, markdown)
    except ValueError as error:
        assert "CV section order diverges" in str(error)
    else:
        raise AssertionError("section reorder accepted without flag")
    validate_cv_section_order(html, markdown, allow_reorder=True)

    assert "@page { size: Letter" in inject_print_page_css("<html><head></head><body></body></html>", "letter")
    assert "<head>" in inject_print_page_css("<html><body></body></html>", "a4")
    assert inject_print_page_css("<p>x</p>", "a4").startswith('<style id="career-ops-page-setup">')


def test_generate_pdf_manifest_fonts_and_page_count(tmp_path):
    root = tmp_path
    (root / "data").mkdir()
    (root / "output").mkdir()
    (root / "fonts").mkdir()
    (root / "fonts/test.woff2").write_bytes(b"font")

    html = "body{font:url('./fonts/test.woff2')} bad:url('./fonts/../secret.ttf')"
    inlined = inline_local_fonts(html, fonts_dir=root / "fonts")
    assert "data:font/woff2;base64" in inlined
    assert "../secret.ttf" in inlined

    pdf = root / "output/cv.pdf"
    source = root / "output/cv.html"
    pdf.write_bytes(b"pdf")
    source.write_text("html", encoding="utf-8")
    rel = update_pdf_manifest("008", pdf, source, "a4", root=root, today="2026-07-15")
    assert rel == "output/cv.pdf"
    update_pdf_manifest("8", root / "output/cv2.pdf", source, "letter", root=root, today="2026-07-16")
    manifest = (root / "data/pdf-index.tsv").read_text(encoding="utf-8")
    assert "008\toutput/cv.pdf" not in manifest
    assert "8\toutput/cv2.pdf\toutput/cv.html\tletter\t2026-07-16" in manifest
    assert repo_relative_manifest_path(source, root=root) == "output/cv.html"
    assert repo_relative_manifest_path(tmp_path.parent / "outside.html", root=root) == ""
    assert count_pdf_pages(b"/Type /Page\n/Type /Pages\n/Type /Page ") == 2


def test_generate_pdf_renders_with_fake_browser_and_cleans_temp(tmp_path):
    root = tmp_path
    (root / "fonts").mkdir()
    (root / "data").mkdir()
    output = root / "output" / "cv.pdf"
    calls = {}

    class FakePage:
        def goto(self, url, wait_until=None):
            calls["url"] = url
            calls["wait_until"] = wait_until

        def evaluate(self, script):
            calls["eval"] = script

        def pdf(self, **kwargs):
            calls["pdf_kwargs"] = kwargs
            return b"%PDF /Type /Page\n"

    class FakeBrowser:
        def __init__(self):
            self.closed = False

        def new_page(self):
            return FakePage()

        def close(self):
            self.closed = True
            calls["closed"] = True

    def launch(options):
        calls["launch"] = options
        return FakeBrowser()

    result = render_html_to_pdf("<html><body>x</body></html>", output, base_dir=root, root=root, launch_browser=launch, input_path=root / "cv.html", report_num="001")

    assert result["pageCount"] == 1
    assert result["size"] == len(b"%PDF /Type /Page\n")
    assert output.exists()
    assert calls["launch"] == {"headless": True}
    assert calls["wait_until"] == "load"
    assert calls["pdf_kwargs"]["prefer_css_page_size"] is True
    assert calls["closed"] is True
    assert not list(root.glob(".career-ops-render-*.html"))
    assert "001\toutput/cv.pdf" in (root / "data/pdf-index.tsv").read_text(encoding="utf-8")


def test_generate_pdf_end_to_end_with_fake_browser_and_guards(tmp_path):
    root = tmp_path
    (root / "data").mkdir()
    (root / "fonts").mkdir()
    (root / "output").mkdir()
    (root / "cv.md").write_text("# Work Experience\n# Projects\n# Education\n", encoding="utf-8")
    html = root / "output/cv.html"
    html.write_text(
        '<html><head></head><body><div class="section-title">Work Experience</div><div class="section-title">Projects</div><div class="section-title">Education</div>R&D → AI</body></html>',
        encoding="utf-8",
    )

    class FakePage:
        def goto(self, *_args, **_kwargs):
            pass

        def evaluate(self, *_args):
            pass

        def pdf(self, **_kwargs):
            return b"%PDF /Type /Page\n"

    class FakeBrowser:
        def new_page(self):
            return FakePage()

        def close(self):
            pass

    result = generate_pdf(html, root / "output/cv.pdf", root=root, report_num="2", launch_browser=lambda _opts: FakeBrowser())
    assert result["pageCount"] == 1

    try:
        generate_pdf(html, tmp_path.parent / "bad.pdf", root=root, launch_browser=lambda _opts: FakeBrowser())
    except ValueError as error:
        assert "outside the project" in str(error)
    else:
        raise AssertionError("outside output accepted")

    try:
        generate_pdf(html, root / "output/bad.pdf", root=root, report_num="abc", launch_browser=lambda _opts: FakeBrowser())
    except ValueError as error:
        assert "Invalid --report" in str(error)
    else:
        raise AssertionError("invalid report accepted")


def cover_template() -> str:
    return """<html><body>
<h1>{{NAME}}</h1>
<div>{{CONTACT_LINE}}</div>
{{CREDENTIALS_BLOCK}}
<h2>{{ROLE_TITLE}}</h2>
<p>{{DATELINE}}</p>
{{GREETING_BLOCK}}
<p>{{OPENING}}</p>
<p>{{PROFILE_INTRO}}</p>
{{ACHIEVEMENTS_BLOCK}}
{{PROBLEMS_BLOCK}}
{{CLOSING_BLOCK}}
{{LANGUAGE_CLOSING_BLOCK}}
{{FOOTNOTES_BLOCK}}
</body></html>"""


def cover_payload():
    return {
        "candidate": {
            "name": "Ada & Co",
            "location": "Paris",
            "email": "ada@example.com",
            "phone": "+33 1",
            "linkedin": "linkedin.com/in/ada",
            "github": "https://github.com/ada",
            "credentials": ["AI", "Automation"],
        },
        "letter": {
            "company": "Acme Inc.",
            "city": "Paris",
            "date": "2026-07-15",
            "role_title": "AI Engineer",
            "greeting": "Dear Team,",
            "opening": "I am interested in <role>.",
            "profile_intro": "I build R&D systems.",
            "achievements": [{"lead": "Shipped", "impact": "Reduced cost by 30%"}],
            "problems_section": "I can help with pipeline quality.",
            "closing": "Best regards,",
            "language_closing": "Available in English and French.",
            "footnotes": [{"marker": "[1]", "text": "Portfolio", "url": "https://example.com"}, "Plain note"],
        },
    }


def test_cover_letter_blocks_and_template_resolution(tmp_path):
    payload = cover_payload()
    template = tmp_path / "cover-letter-template.html"
    template.write_text(cover_template(), encoding="utf-8")

    assert as_url("example.com") == "https://example.com"
    contact = build_contact_line(payload["candidate"])
    assert "mailto:ada@example.com" in contact
    assert "https://linkedin.com/in/ada" in contact
    assert "github.com/ada" in contact
    assert build_achievements_block(payload["letter"]["achievements"]).startswith('<ul class="achievements">')
    assert "https://example.com" in build_footnotes_block(payload["letter"]["footnotes"])

    html = build_cover_html(payload, template_path=template)
    assert "Ada &amp; Co" in html
    assert "I am interested in &lt;role&gt;." in html
    assert "{{" not in html

    try:
        require_fields({}, ["candidate"], "payload")
    except ValueError as error:
        assert "Missing required field: payload.candidate" in str(error)
    else:
        raise AssertionError("missing field accepted")

    assert resolve_cover_template_path({"template": "missing"}, directory=tmp_path).name == "cover-letter-template.html"


def test_cover_letter_output_paths_and_pdf_renderer(tmp_path):
    payload = cover_payload()
    template = tmp_path / "cover-letter-template.html"
    template.write_text(cover_template(), encoding="utf-8")
    rendered = {}

    def renderer(html, output_path, **kwargs):
        rendered["html"] = html
        rendered["output_path"] = output_path
        rendered["kwargs"] = kwargs
        output_path.write_bytes(b"%PDF /Type /Page\n")
        return {"outputPath": str(output_path), "pageCount": 1, "size": 17}

    assert safe_output_path("../bad/../../cover?.pdf", output_root=tmp_path / "output") == tmp_path / "output" / "cover-.pdf"
    assert default_output_path(payload, output_root=tmp_path / "output").name == "acme-inc-ai-engineer-cover.pdf"

    result = generate_cover_letter_pdf(
        payload,
        out="../custom.pdf",
        template_path=template,
        renderer=renderer,
        root=tmp_path,
    )

    assert result["output_path"] == str(tmp_path / "output" / "custom.pdf")
    assert rendered["output_path"] == (tmp_path / "output" / "custom.pdf").resolve(strict=False)
    assert rendered["kwargs"]["format"] == "a4"
    assert rendered["kwargs"]["root"] == tmp_path
    assert "AI Engineer" in rendered["html"]


def test_resolve_input_path_absolute_and_relative(tmp_path):
    from scripts.python.cv.verify_cv_facts import resolve_input_path

    abs_path = Path("/tmp/cv.md")
    assert resolve_input_path(abs_path, cwd=tmp_path) == abs_path

    rel = Path("cv.md")
    assert resolve_input_path(rel, cwd=tmp_path) == tmp_path / "cv.md"

    assert resolve_input_path("sub/dir/file.md", cwd=tmp_path) == tmp_path / "sub/dir/file.md"


def test_assert_format_validates_and_rejects():
    from scripts.python.cv.templates import assert_format

    assert_format("html")
    assert_format("tex")
    for bad in ("pdf", "docx", "txt", "HTML", "TEX", ""):
        try:
            assert_format(bad)
        except ValueError as e:
            assert "Unsupported" in str(e)
        else:
            raise AssertionError(f"assert_format({bad!r}) should have raised")
