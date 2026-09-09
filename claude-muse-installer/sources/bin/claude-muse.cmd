@ECHO off
SETLOCAL
endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & node "%USERPROFILE%\.local\lib\claude-muse\launcher.cjs" %*
