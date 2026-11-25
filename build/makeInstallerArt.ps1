Add-Type -AssemblyName System.Drawing

function New-Header($path) {
  $w = 150; $h = 57
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  # fundo preto puro
  $bg = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#0a0a0b"))
  $g.FillRectangle($bg, 0, 0, $w, $h)

  # logo circular minimalista
  $outer = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#f2f2f2"))
  $g.FillEllipse($outer, 14, 14, 28, 28)
  $inner = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#0a0a0b"))
  $g.FillEllipse($inner, 22, 22, 12, 12)

  # nome
  $font = New-Object System.Drawing.Font("Segoe UI Semibold", 15, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $br = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#f2f2f2"))
  $g.DrawString("Pureza", $font, $br, 50, 19)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $g.Dispose(); $bmp.Dispose()
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
New-Header (Join-Path $root "installerHeader.bmp")
Remove-Item (Join-Path $root "installerSidebar.bmp") -ErrorAction SilentlyContinue
Remove-Item (Join-Path $root "uninstallerSidebar.bmp") -ErrorAction SilentlyContinue
Write-Host "OK"
