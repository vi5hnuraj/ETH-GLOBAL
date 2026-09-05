const run = async () => {
  try {
    const loginRes = await fetch('http://localhost:5550/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'lathaml@gmail.com', password: 'password123' })
    });
    
    if (!loginRes.ok) {
      console.log("Login failed", await loginRes.text());
      return;
    }
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log("Got token");

    const kycRes = await fetch('http://localhost:5550/api/auth/verify-web3-kyc', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({
        kycProvider: 'Gitcoin Passport',
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      })
    });

    console.log("KYC Status:", kycRes.status);
    console.log("KYC Data:", await kycRes.text());
  } catch (err) {
    console.error("API Error:", err);
  }
};
run();
