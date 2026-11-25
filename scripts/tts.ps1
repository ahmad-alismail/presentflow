# Renders German TTS clips (Windows voice "Hedda") to 16 kHz mono 16-bit WAV.
# Usage: powershell -File scripts/tts.ps1 -Clips test/fixtures/clips.json -OutDir test/fixtures/audio
param([Parameter(Mandatory)][string]$Clips, [Parameter(Mandatory)][string]$OutDir, [int]$Rate = 0)
Add-Type -AssemblyName System.Speech
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'de-DE' } | Select-Object -First 1
if (-not $voice) { throw 'No de-DE voice installed' }
$synth.SelectVoice($voice.VoiceInfo.Name)
$synth.Rate = $Rate
New-Item -ItemType Directory -Force $OutDir | Out-Null
$items = Get-Content -Raw -Encoding UTF8 $Clips | ConvertFrom-Json
foreach ($c in $items) {
  $path = Join-Path (Resolve-Path $OutDir) ($c.name + '.wav')
  $synth.SetOutputToWaveFile($path, $fmt)
  $synth.Speak($c.text)
  $synth.SetOutputToNull()
  Write-Output "$($c.name).wav"
}
$synth.Dispose()
