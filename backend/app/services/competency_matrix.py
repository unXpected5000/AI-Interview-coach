from typing import Dict, List, Any

# Map of roles to required skills and their weight (0-10)
# A skill can be highly important (10) or somewhat important (4)
COMPETENCY_MATRIX: Dict[str, Dict[str, int]] = {
    "Software Engineer": {
        "python": 8,
        "java": 8,
        "c++": 7,
        "javascript": 7,
        "data structures": 9,
        "algorithms": 9,
        "git": 6,
        "sql": 6,
        "system design": 8,
        "api": 7
    },
    "Data Scientist": {
        "python": 9,
        "r": 7,
        "sql": 8,
        "machine learning": 9,
        "statistics": 9,
        "data visualization": 7,
        "pandas": 8,
        "numpy": 7,
        "scikit-learn": 8,
        "deep learning": 6
    },
    "Machine Learning Engineer": {
        "python": 9,
        "c++": 6,
        "machine learning": 10,
        "deep learning": 9,
        "tensorflow": 8,
        "pytorch": 8,
        "nlp": 7,
        "computer vision": 7,
        "model deployment": 8,
        "mlops": 7,
        "sql": 5
    },
    "Product Manager": {
        "product strategy": 10,
        "agile": 8,
        "scrum": 7,
        "user research": 8,
        "data analysis": 7,
        "sql": 5,
        "roadmap planning": 9,
        "ab testing": 7,
        "ui/ux": 6,
        "jira": 6
    },
    "Frontend Engineer": {
        "javascript": 9,
        "typescript": 8,
        "html": 8,
        "css": 8,
        "react": 9,
        "angular": 6,
        "vue": 6,
        "web performance": 7,
        "ui/ux": 6,
        "testing": 6
    },
    "Backend Engineer": {
        "python": 8,
        "java": 8,
        "go": 7,
        "nodejs": 7,
        "sql": 9,
        "nosql": 7,
        "api design": 9,
        "microservices": 8,
        "docker": 7,
        "kubernetes": 6,
        "aws": 7
    },
    "Data Engineer": {
        "python": 8,
        "sql": 9,
        "spark": 8,
        "hadoop": 6,
        "etl": 9,
        "data warehousing": 9,
        "aws": 7,
        "airflow": 8,
        "kafka": 7
    },
    "DevOps Engineer": {
        "linux": 9,
        "bash": 8,
        "python": 7,
        "docker": 9,
        "kubernetes": 9,
        "aws": 8,
        "azure": 7,
        "gcp": 7,
        "ci/cd": 10,
        "terraform": 8,
        "ansible": 7
    }
}
