# TQC+ Python Judge — MVP Architecture

This document is a practical starting point for building a small educational online judge for Python programming exercises.

The first goal is intentionally simple:

> Teacher prepares problems and test cases → student submits Python code → system runs it → returns AC / WA / RE / TLE

---

## 1. Recommended Project Structure

```text
tqc-python-judge/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   │
│   │   ├── api/
│   │   │   ├── problems.py
│   │   │   └── submissions.py
│   │   │
│   │   ├── models/
│   │   │   ├── problem.py
│   │   │   └── submission.py
│   │   │
│   │   ├── services/
│   │   │   └── judge.py
│   │   │
│   │   ├── database.py
│   │   └── schemas.py
│   │
│   └── requirements.txt
│
├── frontend/
│   ├── index.html
│   ├── problem.html
│   ├── app.js
│   └── style.css
│
├── problems/
│   ├── 001/
│   │   ├── problem.json
│   │   └── tests/
│   │       ├── 01.in
│   │       ├── 01.out
│   │       ├── 02.in
│   │       └── 02.out
│   │
│   └── 002/
│
├── sandbox/
│   ├── Dockerfile
│   └── runner.py
│
├── data/
│   └── judge.db
│
├── docker-compose.yml
├── .gitignore
└── README.md
```

Core flow:

```text
Frontend
   ↓ HTTP
FastAPI backend
   ↓
Judge service
   ↓
Docker sandbox
```

---

## 2. Problem Format

For the first version, keep problems as files instead of putting everything in the database.

Example:

```text
problems/001/problem.json
```

```json
{
  "id": 1,
  "title": "兩數相加",
  "description": "輸入兩個整數 a, b，輸出 a+b。",
  "input": "兩個整數 a b",
  "output": "輸出 a+b",
  "sample_input": "3 5",
  "sample_output": "8",
  "time_limit": 2,
  "memory_limit": 128
}
```

Test case files:

```text
problems/001/tests/01.in
problems/001/tests/01.out
problems/001/tests/02.in
problems/001/tests/02.out
```

Example:

```text
# 01.in
3 5
```

```text
# 01.out
8
```

---

## 3. Submission Format

Student sends something like:

```json
{
  "problem_id": 1,
  "code": "a, b = map(int, input().split())\nprint(a+b)"
}
```

Later, the API can expose:

```text
POST /api/submissions
```

And return:

```json
{
  "status": "AC",
  "passed": 10,
  "total": 10,
  "runtime": 0.042
}
```

Or:

```json
{
  "status": "WA",
  "passed": 3,
  "total": 10,
  "failed_test": 4
}
```

---

## 4. Judge Service

`services/judge.py` should only judge code.

Conceptually:

```python
def judge(problem_id: int, code: str):
    ...
```

Flow:

```text
Create temporary directory
       ↓
Write main.py
       ↓
Load test cases
       ↓
For each test:
    run program
    ↓
    feed stdin
    ↓
    capture stdout/stderr
    ↓
    compare output
       ↓
Return result
```

Pseudo code:

```python
def judge(problem_id, code):

    tests = load_tests(problem_id)

    for test in tests:

        result = run_code(
            code=code,
            stdin=test.input,
            timeout=2
        )

        if result.timeout:
            return {
                "status": "TLE"
            }

        if result.returncode != 0:
            return {
                "status": "RE",
                "stderr": result.stderr
            }

        if normalize(result.stdout) != normalize(test.output):
            return {
                "status": "WA"
            }

    return {
        "status": "AC"
    }
```

---

## 5. Output Comparison

For the first version, no special judge is needed.

A simple normalizer is enough:

```python
def normalize(s):
    return "\n".join(
        line.rstrip()
        for line in s.strip().splitlines()
    )
```

This ignores trailing whitespace at the end of lines.

---

## 6. Sandbox / Docker

Do not directly run untrusted student code on the host server.

Avoid this for the real web version:

```python
subprocess.run(
    ["python", "student.py"]
)
```

Instead, later run each submission inside Docker.

Example `sandbox/Dockerfile`:

```dockerfile
FROM python:3.13-slim

RUN useradd -m runner

USER runner

WORKDIR /app

CMD ["python3", "main.py"]
```

Example execution:

```bash
docker run \
    --rm \
    --network none \
    --memory 128m \
    --cpus 0.5 \
    -v submission_folder:/app:ro \
    tqc-python-runner
```

Important restrictions:

```text
--network none
--memory 128m
--cpus 0.5
```

Also enforce execution time from the host side.

---

## 7. Database

SQLite is enough for the first real version.

Possible tables:

```text
submissions
-----------
id
problem_id
student_name
code
status
runtime
submitted_at
```

Later, add:

```text
users
-----
id
username
password_hash
role
```

Possible roles:

```text
student
teacher
admin
```

For the MVP, login can be skipped completely.

---

## 8. API

Start with only:

```text
GET  /api/problems
GET  /api/problems/{id}

POST /api/submissions
GET  /api/submissions/{id}
```

Do not expose private `.out` files to the frontend.

The frontend should only receive sample test cases.

---

## 9. Frontend MVP

The first UI can be very simple:

```text
TQC+ Python Practice
────────────────────

題目 001：兩數相加

輸入：
兩個整數 a b

輸出：
a + b

Example

Input
3 5

Output
8

Your code:

┌────────────────────────────┐
│                            │
│                            │
│                            │
└────────────────────────────┘

          [ Submit ]

Result

✅ Accepted

10 / 10 tests passed
Runtime: 42 ms
```

A plain `<textarea>` is enough at first.

---

# Development Order

Do not build the entire online judge at once.

Use this order:

```text
Phase 1
CLI Judge
↓
python judge.py 001 solution.py
↓
AC / WA / RE / TLE
```

Then:

```text
Phase 2
Docker Judge
```

Then:

```text
Phase 3
FastAPI
```

Then:

```text
Phase 4
Web UI
```

Then:

```text
Phase 5
SQLite submission history
```

Then:

```text
Phase 6
Accounts
Teacher dashboard
Statistics
```

---

# First Codex Prompt

Use this as the first prompt for Codex:

```text
I want to build a small educational online judge for Python programming exercises.

The eventual architecture will use FastAPI, SQLite, and Docker, but DO NOT build the web application yet.

For now, implement Phase 1 only: a command-line judge.

Create this project structure:

tqc-python-judge/
├── judge.py
├── problems/
│   └── 001/
│       ├── problem.json
│       └── tests/
│           ├── 01.in
│           ├── 01.out
│           ├── 02.in
│           └── 02.out
├── solutions/
│   └── example.py
└── README.md

The CLI should work like:

python3 judge.py 001 solutions/example.py

Requirements:

1. Load all .in/.out testcase pairs under problems/<problem_id>/tests.
2. Run the submitted Python program separately for each testcase.
3. Send the .in file content to stdin.
4. Capture stdout and stderr.
5. Enforce a 2 second timeout.
6. Report:
   - AC: all tests passed
   - WA: output is incorrect
   - RE: program exits with an error
   - TLE: program exceeds the timeout
7. Ignore trailing whitespace at the end of each output line when comparing outputs.
8. Show which testcase failed.
9. Do not use Docker yet.
10. Keep the implementation simple and readable because this is an educational project.

Create a sample problem 001 that asks the user to input two integers and print their sum.

Before modifying files, briefly explain what you are going to create. Then implement it.
```

---

# Suggested First Commands

```bash
mkdir tqc-python-judge
cd tqc-python-judge
git init
codex
```

Then paste the prompt above.

The first milestone should be:

```text
$ python3 judge.py 001 solutions/example.py

Problem 001

Test 01: AC
Test 02: AC

Result: AC
Passed: 2/2
```

Once this works, move on to Docker isolation before building the web interface.
