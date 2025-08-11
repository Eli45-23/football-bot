require('dotenv').config();

/**
 * Demo script showing Discord output format
 * Uses mock data to show the exact formatting
 */
function demoDiscordOutput() {
  console.log('📱 Discord Output Format Demo\n');
  console.log('='.repeat(70));
  console.log('This shows exactly how your NFL bot messages appear in Discord');
  console.log('='.repeat(70));
  
  // Mock data representing what GPT would produce
  const mockDataWithGPT = {
    injuries: {
      bullets: [
        'Alexander Mattison (MIA) — Out for season (neck surgery) · Updated Aug 19 (ESPN)',
        'Landon Dickerson (PHI) — MRI scheduled Monday (ankle) · Updated Aug 19 (Yahoo)',
        'Morice Norris (DET) — In concussion protocol, doing well · Updated Aug 19 (PFT)',
        'Rachaad White (TB) — Day-to-day (groin injury) · Updated Aug 18 (CBS)',
        'Deon Bush (KC) — Torn Achilles, season-ending · Updated Aug 18 (PFT)',
        'Matthew Stafford (LAR) — Not practicing, back issue monitoring · Updated Aug 19 (Yahoo)',
        'Tyjae Spears (TEN) — Out rest of preseason (ankle) · Updated Aug 18 (PFR)',
        'Luke Floriea (CLE) — Waived with injury designation · Updated Aug 19 (Yahoo)'
      ],
      totalCount: 8,
      source: 'ESPN table + GPT'
    },
    rosterChanges: {
      bullets: [
        'Commanders — Signed CBs Antonio Hamilton, Essang Bassey, LB Duke Riley (PFR)',
        'Panthers — Austin Corbett named starting center · Updated Aug 19 (PFT)',
        'Steelers — Signed TE Kevin Foelsch, DB Mikey Victor (ESPN)',
        'Dolphins — Working out RB Jamaal Williams · Updated Aug 19 (PFT)',
        'Browns — Waived WR Luke Floriea with injury designation (Yahoo)'
      ],
      totalCount: 5,
      source: 'PFR + GPT'
    },
    breakingNews: {
      bullets: [
        'Cowboys — Jerry Jones calls team "soap opera 365 days a year" (ESPN)',
        'NFL — House Judiciary Committee reviewing Sunday Ticket practices (CBS)',
        'Chiefs — Deon Bush suffers torn Achilles in practice (PFT)'
      ],
      totalCount: 3,
      source: 'GPT'
    }
  };
  
  const mockDataWithoutGPT = {
    injuries: {
      bullets: [
        'Justin Herbert (LAC) — Questionable (foot) · Updated Aug 18 (ESPN)',
        'Tua Tagovailoa (MIA) — Questionable (hip) · Updated Aug 18 (ESPN)',
        'Aaron Rodgers (NYJ) — Probable (calf) · Updated Aug 17 (ESPN)',
        'Dak Prescott (DAL) — Questionable (shoulder) · Updated Aug 17 (ESPN)',
        'Josh Allen (BUF) — Probable (hand) · Updated Aug 17 (ESPN)'
      ],
      totalCount: 5,
      source: 'ESPN table'
    },
    rosterChanges: {
      bullets: [
        'Cowboys: Signed LB Joe Cardona',
        'Patriots: Released WR Kendrick Bourne'
      ],
      totalCount: 2,
      source: 'PFR'
    },
    breakingNews: {
      bullets: [],
      totalCount: 0,
      source: 'None'
    }
  };
  
  function displayDiscordMessage(title, data, footer) {
    console.log('\n' + '─'.repeat(60));
    console.log(`📌 ${title}`);
    console.log('─'.repeat(60));
    
    // Injuries Section
    console.log('\n🏥 Injuries');
    if (data.injuries.bullets.length > 0) {
      data.injuries.bullets.forEach(bullet => {
        console.log(`• ${bullet}`);
      });
    } else {
      console.log('• No updates');
    }
    
    // Roster Changes Section  
    console.log('\n🔁 Roster Changes');
    if (data.rosterChanges.bullets.length > 0) {
      data.rosterChanges.bullets.forEach(bullet => {
        console.log(`• ${bullet}`);
      });
    } else {
      console.log('• No updates');
    }
    
    // Breaking News Section
    console.log('\n📰 Breaking News');
    if (data.breakingNews.bullets.length > 0) {
      data.breakingNews.bullets.forEach(bullet => {
        console.log(`• ${bullet}`);
      });
    } else {
      console.log('• No updates');
    }
    
    // Scheduled Games would go here (showing mock)
    console.log('\n📅 Scheduled Games');
    console.log('• Chiefs @ Steelers - Aug 20, 8:00 PM');
    console.log('• Cowboys @ Seahawks - Aug 21, 7:30 PM');
    console.log('• Ravens @ Eagles - Aug 22, 7:00 PM');
    
    // Footer
    console.log(`\n${footer}`);
    console.log('─'.repeat(60));
  }
  
  // Show both versions
  console.log('\n🤖 WITH GPT ENHANCEMENT:');
  displayDiscordMessage(
    'NFL Afternoon Update – August 19, 2024 – 2:00 PM EST',
    mockDataWithGPT,
    '🗂 Sources: TheSportsDB • ESPN • NFL.com • PFT • Yahoo • CBS • ProFootballRumors (+ GPT polish)'
  );
  
  console.log('\n\n🔌 WITHOUT GPT (Rule-based only):');
  displayDiscordMessage(
    'NFL Afternoon Update – August 19, 2024 – 2:00 PM EST', 
    mockDataWithoutGPT,
    '🗂 Sources: TheSportsDB • ESPN • NFL.com • Yahoo • CBS Sports • ProFootballTalk (Full-text analysis)'
  );
  
  console.log('\n' + '='.repeat(70));
  console.log('📊 KEY IMPROVEMENTS WITH GPT:');
  console.log('='.repeat(70));
  console.log('✅ More detailed injury information with timeline');
  console.log('✅ Cleaner formatting and consistent structure');
  console.log('✅ Better source attribution');
  console.log('✅ Deduplication across sources');
  console.log('✅ Enhanced fact extraction from full article text');
  console.log('✅ Fills sparse sections with relevant content');
  console.log('✅ Never invents facts - only extracts from RSS/ESPN data');
  
  console.log('\n💰 COST ESTIMATION:');
  console.log(`• ~3 GPT calls per update × 3 updates daily = 9 calls/day`);
  console.log(`• ~3,600 tokens per call = 32,400 tokens/day`);
  console.log(`• At $0.15/1M tokens = ~$0.005/day (well under $0.01 target)`);
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ This is how your enhanced NFL Discord bot will look!');
  console.log('='.repeat(70));
}

demoDiscordOutput();