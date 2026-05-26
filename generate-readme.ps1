# ================================
# Auto README Generator
# ================================

# Project name (folder name)
$projectName = Split-Path -Leaf (Get-Location)

# ----------------
# Detect Tech Stack
# ----------------
$techStack = @()

if (Get-ChildItem -Recurse -Filter *.py -ErrorAction SilentlyContinue) { $techStack += "Python" }
if (Get-ChildItem -Recurse -Filter *.js -ErrorAction SilentlyContinue) { $techStack += "JavaScript" }
if (Get-ChildItem -Recurse -Filter *.ts -ErrorAction SilentlyContinue) { $techStack += "TypeScript" }
if (Get-ChildItem -Recurse -Filter *.java -ErrorAction SilentlyContinue) { $techStack += "Java" }
if (Get-ChildItem -Recurse -Filter *.cs -ErrorAction SilentlyContinue) { $techStack += ".NET (C#)" }

if (Test-Path "package.json") { $techStack += "Node.js (npm)" }
if (Test-Path "angular.json") { $techStack += "Angular" }
if (Test-Path "pom.xml") { $techStack += "Maven" }
if (Test-Path "build.gradle") { $techStack += "Gradle" }
if (Test-Path "requirements.txt") { $techStack += "pip" }

$techStack = $techStack | Sort-Object -Unique

# ----------------
# Detect Project Type
# ----------------
$projectType = "Application"

if (Test-Path "package.json") { $projectType = "Node.js Application" }
if (Test-Path "angular.json") { $projectType = "Angular Frontend" }
if (Test-Path "pom.xml") { $projectType = "Java (Maven) Backend" }

# ----------------
# Detect Run Commands
# ----------------
$runCommand = ""

if (Test-Path "package.json") { $runCommand = "npm install`nnpm start" }
elseif (Test-Path "angular.json") { $runCommand = "npm install`nng serve" }
elseif (Test-Path "pom.xml") { $runCommand = "mvn clean install`nmvn spring-boot:run" }
elseif (Test-Path "requirements.txt") { $runCommand = "pip install -r requirements.txt`npython main.py" }

# ----------------
# Project Structure (Top-level)
# ----------------
$folders = Get-ChildItem -Directory | Select-Object -ExpandProperty Name

$structure = ""
foreach ($folder in $folders) {
    $structure += "├── $folder`n"
}

# ----------------
# Generate README Content
# ----------------
$readme = @"
# $projectName

## 📌 Description
This is an auto-generated README for a **$projectType**.

---

## 🚀 Tech Stack
$(($techStack | ForEach-Object { "- $_" }) -join "`n")

---

## 📁 Project Structure
\`\`\`
$structure
\`\`\`

---

## ⚙️ Setup Instructions

### Prerequisites
- Install required tools based on tech stack

### Installation
\`\`\`bash
$runCommand
\`\`\`

---

## ▶️ Run the Application
\`\`\`bash
$runCommand
\`\`\`

---

## 🔌 API Endpoints
> Add your API endpoints here

Example:
\`\`\`http
GET /api/example
\`\`\`

---

## 🧪 Testing
Add test instructions here.

---

## 🤝 Contributing
Pull requests are welcome.

---

## 📄 License
Specify your license here.

"@

# ----------------
# Write README
# ----------------
Set-Content -Path "README.md" -Value $readme

Write-Host "✅ README.md generated successfully!"