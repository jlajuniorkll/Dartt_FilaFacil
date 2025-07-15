// To run this script, use: npx tsx src/lib/seed.ts
import 'dotenv/config'; // Load environment variables from .env file
import { seedUser } from './auth/actions';

const seed = async () => {
    console.log('Seeding database...');
    
    // IMPORTANT: Replace with the desired admin credentials
    const adminEmail = 'adm@proconcaxias.com.br';
    const adminPassword = 'administrador';

    // IMPORTANT: Replace with the desired operator credentials
    const operatorEmail = 'ope@proconcaxias.com.br';
    const operatorPassword = 'operador';

    try {
        const adminResult = await seedUser(adminEmail, adminPassword, 'admin');
        if (adminResult.success) {
            console.log(`✅ Admin user created with UID: ${adminResult.uid}`);
        } else {
            console.error(`❌ Error creating admin user: ${adminResult.error}`);
        }

        const operatorResult = await seedUser(operatorEmail, operatorPassword, 'operator');
        if (operatorResult.success) {
            console.log(`✅ Operator user created with UID: ${operatorResult.uid}`);
        } else {
            console.error(`❌ Error creating operator user: ${operatorResult.error}`);
        }

    } catch (error) {
        console.error('An unexpected error occurred during seeding:', error);
    }
    
    console.log('Seeding complete.');
    // The script will hang due to the Firebase connection. Manually exit with Ctrl+C.
};

seed();
