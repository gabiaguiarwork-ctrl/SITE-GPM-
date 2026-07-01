Add-Type -AssemblyName System.IO.Compression.FileSystem
function ReadEntry([System.IO.Compression.ZipArchive]System.IO.Compression.ZipArchive,[string]){ =System.IO.Compression.ZipArchive.GetEntry(); if(-not ){System.IO.Compression.ZipArchive.Dispose(); return }; System.IO.StreamReader=New-Object System.IO.StreamReader(.Open()); =System.IO.StreamReader.ReadToEnd(); System.IO.StreamReader.Close(); System.IO.Compression.ZipArchive.Dispose(); return  }
 = [xml](ReadEntry ([System.IO.Compression.ZipFile]::OpenRead('CRM/FUNIL_MDO_corrigido.xlsx')) 'xl/worksheets/sheet1.xml')
Write-Output .OuterXml.Substring(0,1000)

