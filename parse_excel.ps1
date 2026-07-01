Add-Type -AssemblyName System.IO.Compression.FileSystem
function ReadEntry([System.IO.Compression.ZipArchive]$zip, [string]$name) {
    $entry = $zip.GetEntry($name)
    if (-not $entry) { return $null }
    $reader = New-Object System.IO.StreamReader($entry.Open())
    $content = $reader.ReadToEnd()
    $reader.Close()
    return $content
}
$zip = [System.IO.Compression.ZipFile]::OpenRead('CRM/FUNIL_MDO_corrigido.xlsx')
$sharedXml = ReadEntry $zip 'xl/sharedStrings.xml'
$sheetXml = ReadEntry $zip 'xl/worksheets/sheet1.xml'
$zip.Dispose()
$shared = [xml]$sharedXml
$sheet = [xml]$sheetXml
function GetStringValue($node) {
    if ($null -eq $node) { return '' }
    if ($node.t) { return $node.t.'#text' }
    if ($node.r) { return ($node.r | ForEach-Object { $_.t.'#text' }) -join '' }
    return ''
}
function ResolveCell($cell) {
    if ($cell.t -eq 's') {
        $idx = [int]$cell.v
        return GetStringValue $shared.sst.si[$idx]
    }
    return $cell.v.'#text'
}
$row1 = $sheet.worksheet.sheetData.row | Where-Object { $_.r -eq '1' }
Write-Output 'HEADER CELLS:'
foreach ($cell in $row1.c) {
    $value = ResolveCell $cell
    Write-Output "$($cell.r): $value"
}
Write-Output ''
Write-Output 'FIRST 20 ROWS:'
$rows = $sheet.worksheet.sheetData.row | Select-Object -First 20
foreach ($row in $rows) {
    $cells = @()
    foreach ($cell in $row.c) {
        $cells += "$($cell.r): $(ResolveCell $cell)"
    }
    Write-Output "ROW $($row.r): $($cells -join ' | ')"
}
