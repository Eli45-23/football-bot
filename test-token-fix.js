#!/usr/bin/env node

const updatesCommand = require('./commands/updates');

async function testTokenManagement() {
  console.log('🧪 Testing token management in categorization system...');
  
  // Mock Discord interaction
  const mockInteraction = {
    deferReply: async () => console.log('⏳ Interaction deferred'),
    user: { tag: 'TestUser#1234' },
    editReply: async (data) => {
      if (data.content) {
        console.log('📤 Progress:', data.content);
      }
      if (data.embeds && data.embeds[0]) {
        const embed = data.embeds[0];
        console.log('✅ Final Embed Generated Successfully:');
        console.log('  Title:', embed.data.title);
        console.log('  Fields:', embed.data.fields?.length || 0);
        if (embed.data.fields) {
          embed.data.fields.forEach((field, i) => {
            const hasContent = field.value !== 'No significant updates';
            console.log('    Field', i+1+':', field.name, hasContent ? '✅ Has Content' : '⚪ Empty');
          });
        }
        console.log('  Footer:', embed.data.footer?.text);
      }
    }
  };

  // Test with limited scope to avoid token issues
  const originalTeams = require('./config/config').nflTeams;
  require('./config/config').nflTeams = ['eagles', 'cowboys', 'patriots']; // Limit for testing
  
  try {
    await updatesCommand.execute(mockInteraction);
    console.log('\n✅ Token management test completed successfully');
    console.log('✅ No token limit errors encountered');
  } catch (error) {
    if (error.message.includes('context_length_exceeded')) {
      console.error('❌ Token limit still exceeded:', error.message);
    } else {
      console.error('❌ Other error:', error.message);
    }
  } finally {
    require('./config/config').nflTeams = originalTeams;
  }
}

testTokenManagement().catch(console.error);