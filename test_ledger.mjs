import { calculateLedgerFinancials, calculateAllUsersTotalFinancials } from './src/services/lotto/ledger.js';
console.log('Functions imported!');
try {
    const res1 = calculateLedgerFinancials(true, 'my');
    console.log('calculateLedgerFinancials my:', res1);
    
    calculateAllUsersTotalFinancials().then(res => {
        console.log('calculateAllUsersTotalFinancials all:', res);
    }).catch(e => {
        console.error('Error in calculateAllUsersTotalFinancials:', e);
    });
} catch(e) {
    console.error('Error:', e);
}
