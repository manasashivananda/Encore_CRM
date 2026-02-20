export function speakText(text) {
    const msg = new SpeechSynthesisUtterance(text);

    const voices = window.speechSynthesis.getVoices();

    // PRIORITY: pick soft female voices if available
    const softFemaleVoice =
        voices.find(v => v.name.includes("Google UK English Female")) ||
        voices.find(v => v.name.includes("Google US English")) ||
        voices.find(v => v.name.includes("Samantha")) ||   // MacOS soft female
        voices.find(v => v.name.includes("Microsoft Zira")) || // Windows soft female
        voices.find(v => v.name.toLowerCase().includes("female")) ||
        voices[0]; // fallback

    msg.voice = softFemaleVoice;

    // "SOFT FEMALE" tonality
    msg.pitch = 1.3;     // slightly higher pitch
    msg.rate = 0.95;     // slightly slower for gentle tone
    msg.volume = 1;      // full volume but soft delivery depends on voice

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(msg);
}
