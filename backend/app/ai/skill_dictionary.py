SKILL_PATTERNS: dict[str, list[str]] = {
    "Python": [r"\bpython\b"],
    "FastAPI": [r"\bfastapi\b"],
    "MongoDB": [r"\bmongodb\b"],
    "React": [r"\breact\b"],
    "Tailwind CSS": [r"\btailwind css\b", r"\btailwind\b"],
    "JavaScript": [r"\bjavascript\b", r"\bjs\b"],
    "TypeScript": [r"\btypescript\b", r"\bts\b"],
    "JWT": [r"\bjwt\b"],
    "REST APIs": [r"\brest api\b", r"\brest apis\b", r"\bapi\b"],
    "SQL": [r"\bsql\b"],
    "Git": [r"\bgit\b", r"\bgithub\b"],
    "Docker": [r"\bdocker\b"],
    "AWS": [r"\baws\b"],
    "Testing": [r"\bpytest\b", r"\btesting\b", r"\bunit test\b"],
    "Pydantic": [r"\bpydantic\b"],
    "PyMuPDF": [r"\bpymupdf\b", r"\bfitz\b"],
    "Sentence Transformers": [r"\bsentence[- ]?transformers\b", r"\bsentence bert\b", r"\bsbert\b"],
    "NumPy": [r"\bnumpy\b"],
    "Authentication": [r"\boauth\b", r"\bauthentication\b", r"\bauthorization\b"],
}

SKILL_ORDER = list(SKILL_PATTERNS.keys())

