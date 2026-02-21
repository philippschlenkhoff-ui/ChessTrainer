Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Ordner des Skripts ermitteln (Projektordner)
folder = fso.GetParentFolderName(WScript.ScriptFullName)

' Command: in Projektordner wechseln und einfachen HTTP-Server starten
' Reihenfolge:
' 1) python -m http.server 8080 (falls Python installiert ist)
' 2) py -m http.server 8080 (alternativer Python-Launcher)
' 3) npx http-server . -p 8080 (falls Node + http-server nutzbar sind)
cmd = "cmd /k title Die Rook Server & cd /d """ & folder & """ & ( " & _
      "where python >nul 2>nul && python -m http.server 8080 " & _
      "|| where py >nul 2>nul && py -m http.server 8080 " & _
      "|| npx http-server . -p 8080" & _
      " )"

' Neues Terminal-Fenster öffnen, Server darin starten
shell.Run cmd, 1, False

