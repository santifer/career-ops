# Step 1: Find the kanban file
$found = Get-ChildItem -Path "$env:LOCALAPPDATA\Packages\Claude_pzs8sxrjxfjjc" -Recurse -Filter 'job-pulse-kanban.html' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1

$sourcePath = if ($found) { $found.FullName } else { "NOT FOUND" }

# Step 2: Create the dashboard directory
New-Item -ItemType Directory -Force -Path 'C:\Users\rahil\career-ops\dashboard' | Out-Null

# Step 3: Copy the file (if found)
$copyResult = "SKIPPED"
if ($found) {
    Copy-Item -Path $sourcePath -Destination 'C:\Users\rahil\career-ops\dashboard\job-pulse-kanban.html' -Force
    $copyResult = "DONE"
}

# Step 4: Verify and get file size
$destExists = Test-Path 'C:\Users\rahil\career-ops\dashboard\job-pulse-kanban.html'
$fileSize = if ($destExists) { (Get-Item 'C:\Users\rahil\career-ops\dashboard\job-pulse-kanban.html').Length } else { 0 }

# Write results to log
$log = @"
SOURCE_PATH=$sourcePath
COPY_RESULT=$copyResult
DEST_EXISTS=$destExists
FILE_SIZE_BYTES=$fileSize
"@

$log | Out-File -FilePath 'C:\Users\rahil\career-ops\kanban-copy-result.txt' -Encoding UTF8
Write-Host $log
