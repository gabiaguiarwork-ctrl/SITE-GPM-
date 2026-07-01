Add-Type -AssemblyName System.IO.Compression.FileSystem
function ReadEntry([System.IO.Compression.ZipArchive]$zip,[string]$name){
  $entry=$zip.GetEntry($name)
  if(-not $entry){ return $null }
  $reader=New-Object System.IO.StreamReader($entry.Open())
  $content=$reader.ReadToEnd()
  $reader.Close()
  return $content
}
$zip=[System.IO.Compression.ZipFile]::OpenRead('CRM/FUNIL_MDO_corrigido.xlsx')
$shared=[xml](ReadEntry $zip 'xl/sharedStrings.xml')
$sheet=[xml](ReadEntry $zip 'xl/worksheets/sheet1.xml')
$zip.Dispose()
function GetStringValue($node){
  if($null -eq $node){ return '' }
  if($node.t){ return $node.t.'#text' }
  if($node.r){ return ($node.r | ForEach-Object { $_.t.'#text' }) -join '' }
  return ''
}
function ResolveCell($cell){
  if($cell.t -eq 's'){
    $idx=[int]$cell.v
    return GetStringValue $shared.sst.si[$idx]
  }
  return $cell.v.'#text'
}
$rows=$sheet.worksheet.sheetData.row | Select-Object -First 100
$columnSamples=@{}
foreach($row in $rows){
  foreach($cell in $row.c){
    $letter=($cell.r -replace '\d+$','')
    $value=ResolveCell $cell
    if(-not $columnSamples.ContainsKey($letter)){
      $columnSamples[$letter]=New-Object System.Collections.ArrayList
    }
    if($value -ne '' -and -not $columnSamples[$letter].Contains($value)){
      [void]$columnSamples[$letter].Add($value)
    }
  }
}
foreach($letter in $columnSamples.Keys | Sort-Object){
  $sample = $columnSamples[$letter] -join ' | '
  Write-Output ('{0}: {1}' -f $letter, $sample)
}
