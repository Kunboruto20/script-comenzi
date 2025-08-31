#!/bin/bash

clear

# LICENȚĂ ȘI TITLU
echo -e "\e[1;34m"
echo "====================================================================================="
echo "  INSTALLER SCRIPT — WhiskeySockets/Baileys Bot"
echo "  LICENSE: Gyovanny Srg © 2024 — All rights reserved"
echo "====================================================================================="
echo -e "\e[0m"
sleep 1

# INTRODUCERE
echo -e "\e[1;33mPregătesc mediul de dezvoltare. Așteaptă câteva minute...\e[0m"
echo -e "📜 LICENSE: Gyovanny Srg © 2024 — Utilizare permisă doar cu acordul autorului"
sleep 1

# ACTUALIZARE SISTEM
echo -e "\nActualizez pachetele sistemului..."
echo -e "📜 LICENSE: Gyovanny Srg © 2024 — Distribuție interzisă fără permisiune"
pkg update -y && pkg upgrade -y

# INSTALARE DEPENDINȚE TERMUX
echo -e "\nInstalez Node.js, Git, FFmpeg, Python și yt-dlp..."
echo -e "📜 LICENSE: Gyovanny Srg © 2024 — Script original, modificările sunt interzise"
pkg install nodejs git jq ffmpeg python -y
pkg install yt-dlp -y

# INSTALARE DEPENDINȚE NPM
echo -e "\nInstalez modulele necesare pentru bot..."
echo -e "📜 LICENSE: Gyovanny Srg © 2024 — Cod protejat de drepturi de autor"
npm install @whiskeysockets/baileys@latest qrcode-terminal pino chalk fluent-ffmpeg

# CONFIRMARE FINALĂ
echo -e "\n✅ Toate dependințele au fost instalate cu succes!"
echo -e "📜 LICENSE: Gyovanny Srg © 2024 — Nu redistribui fără acord scris"

# EFECT MATRIX (OPȚIONAL)
echo -e "\nActivare mod consolă..."
echo -e "📜 LICENSE: Gyovanny Srg © 2024 — Efect vizual inclus în scriptul original"
for i in {1..10}; do
    echo -e "\e[1;32m$(tr -dc '01' </dev/urandom | head -c 60)"
    sleep 0.1
done

# EXECUTARE SCRIPT PRINCIPAL
echo -e "\nPornesc scriptul principal..."
echo -e "📜 LICENSE: Gyovanny Srg © 2024 — Executare permisă doar în scopuri personale"
sleep 1
npm start

# FINALIZARE
echo -e "\n✅ WhiskeySockets/Baileys instalat cu succes de Gyovanny Srg"
echo -e "📜 LICENSE: Gyovanny Srg © 2024 — Toate drepturile rezervate\n"

# EFECT MATRIX (OPȚIONAL)
echo -e "Activando modo consola..."
echo -e "📜 LICENSE: Gyovanny Srg © 2024 — Nu modifica această secțiune"
for i in {1..10}; do
    echo -e "\e[1;32m$(tr -dc '01' </dev/urandom | head -c 60)"
    sleep 0.1
done

# EXECUTARE SCRIPT PRINCIPAL (REPETAT)
echo -e "\nLanzando script principal..."
echo -e "📜 LICENSE: Gyovanny Srg © 2024 — Reutilizarea fără permisiune este interzisă"
sleep 1
npm start
