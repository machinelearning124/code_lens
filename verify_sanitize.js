
const sanitizeLabelStrict = (rawCode) => {
    if (!rawCode) return "";
    let clean = rawCode.replace(/\s+/g, " ").trim();
    if (clean.length > 50) clean = clean.substring(0, 50) + "...";

    // Unicode Homoglyph Substitution (Fullwidth Characters) - NATIVE INJECTION
    clean = clean.replace(/&/g, "\uFF06"); // ＆
    clean = clean.replace(/</g, "\uFF1C"); // ＜
    clean = clean.replace(/>/g, "\uFF1E"); // ＞
    clean = clean.replace(/"/g, "\uFF02"); // ＂
    clean = clean.replace(/'/g, "\uFF07"); // ＇
    clean = clean.replace(/\(/g, "\uFF08"); // （
    clean = clean.replace(/\)/g, "\uFF09"); // ）
    clean = clean.replace(/\[/g, "\uFF3B"); // ［
    clean = clean.replace(/\]/g, "\uFF3D"); // ］
    clean = clean.replace(/\{/g, "\uFF5B"); // ｛
    clean = clean.replace(/\}/g, "\uFF5D"); // ｝
    clean = clean.replace(/;/g, "\uFF1B"); // ；
    clean = clean.replace(/#/g, "\uFF03"); // ＃

    // NEW DETECTED BREAKERS
    clean = clean.replace(/\|/g, "\uFF5C"); // ｜
    clean = clean.replace(/%/g, "\uFF05");  // ％
    clean = clean.replace(/@/g, "\uFF20");  // ＠
    clean = clean.replace(/:/g, "\uFF1A");  // ：
    clean = clean.replace(/\^/g, "\uFF3E"); // ＾

    clean = clean.replace(/\\/g, "\uFF3C"); // ＼
    return clean;
};

const runTest = (input, expectedSubstring, name) => {
    const result = sanitizeLabelStrict(input);
    const passed = result.includes(expectedSubstring);
    console.log(`Test '${name}': ${passed ? "PASS" : "FAIL"}`);
    if (!passed) {
        console.log(`   Input:    ${input}`);
        console.log(`   Output:   ${result}`);
        console.log(`   Expected: ...${expectedSubstring}...`);
        // Show char codes for debug
        console.log(`   Output codes: ${result.split('').map(c => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')).join('')}`);
    }
    return passed;
};

console.log("Starting Verification of Aggressive Unicode Injection...");
let allPassed = true;

allPassed &= runTest('i < 10', '\uFF1C', 'Less Than');
allPassed &= runTest('i > 5', '\uFF1E', 'Greater Than');
allPassed &= runTest('console.log("hello")', '\uFF02', 'Double Quote');
allPassed &= runTest('for(let i=0; i<10; i++)', '\uFF1B', 'Semicolon');
allPassed &= runTest('array[0]', '\uFF3B', 'Left Bracket');

// NEW TESTS
allPassed &= runTest('a || b', '\uFF5C', 'Pipe (OR operator)');
allPassed &= runTest('user@email', '\uFF20', 'At Sign');
allPassed &= runTest('100%', '\uFF05', 'Percent');
allPassed &= runTest('key:value', '\uFF1A', 'Colon');
allPassed &= runTest('x^2', '\uFF3E', 'Circumflex');

if (allPassed) {
    console.log("ALL TESTS PASSED. Logic is robust.");
    process.exit(0);
} else {
    console.error("SOME TESTS FAILED.");
    process.exit(1);
}
