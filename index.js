function testRenderAPI() {
  // Aapka Render URL
  var api_url = "https://whatsapp-free-api-p5l1.onrender.com/send-message";
  
  // YAHAN APNA 10 DIGIT NUMBER DAALEIN (Bina +91 ke)
  var my_number = "9999999999"; 
  
  var payload = {
    "number": my_number,
    "message": "🚀 Hello Alakesh! Agar aapko ye message mila, toh Apps Script aur API ka connection 100% perfect hai!"
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true // Isse humein exact error dikhega
  };

  try {
    Logger.log("Render API ko message bhej rahe hain...");
    var response = UrlFetchApp.fetch(api_url, options);
    
    // Result check karna
    Logger.log("Server Response Code: " + response.getResponseCode());
    Logger.log("Server Message: " + response.getContentText());
    
  } catch (error) {
    Logger.log("Bhejne mein Error aaya: " + error.toString());
  }
}
