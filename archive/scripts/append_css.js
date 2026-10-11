const fs = require('fs');
const css = `
/* Debt Modal Form Layouts */
.debt-form-grid-2-1 { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; }
.debt-form-grid-1-1 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 576px) {
    .debt-form-grid-2-1, .debt-form-grid-1-1 {
        grid-template-columns: 1fr;
        gap: 8px;
    }
}
`;
fs.appendFileSync('frontend/style.css', css);
console.log('Appended to style.css');
