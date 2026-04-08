#!/usr/bin/env node
/**
 * Career-Ops CLI - Add Companies Command
 * Bulk add companies to portals.yml
 * 
 * Usage: career-ops add-companies [category] [options]
 */

import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { loadConfig, loadCV } from '../core/config.js';
import { LLMClient } from '../core/llm.js';
import inquirer from 'inquirer';

const program = new Command();

// Pre-defined company packs
const COMPANY_PACKS = {
  gulf: [
    { name: 'Careem', careers_url: 'https://www.careem.com/careers', notes: 'Dubai. Ride-hailing, fintech, delivery.', region: 'UAE' },
    { name: 'Noon', careers_url: 'https://www.noon.com/uae-en/careers', notes: 'Dubai. E-commerce, logistics, fintech.', region: 'UAE' },
    { name: 'Tabby', careers_url: 'https://www.tabby.ai/careers', notes: 'Dubai/Saudi. Buy now pay later fintech.', region: 'UAE/Saudi' },
    { name: 'Stc Pay', careers_url: 'https://stcpay.com.sa/careers', notes: 'Saudi Arabia. Digital wallet and fintech.', region: 'Saudi' },
    { name: 'Salla', careers_url: 'https://salla.com/careers', notes: 'Saudi Arabia. E-commerce platform.', region: 'Saudi' },
    { name: 'Tamara', careers_url: 'https://tamara.co/careers', notes: 'Saudi. Buy now pay later.', region: 'Saudi' },
    { name: 'Eyad Sadiq', careers_url: 'https://eyad.com/careers', notes: 'Saudi. HR tech.', region: 'Saudi' },
    { name: 'Jisr', careers_url: 'https://jisr.net/careers', notes: 'Saudi. HR and payroll platform.', region: 'Saudi' },
    { name: 'Lucidya', careers_url: 'https://lucidya.com/careers', notes: 'Saudi. AI-powered customer experience.', region: 'Saudi' },
    { name: 'Sary', careers_url: 'https://sary.com/careers', notes: 'Saudi. B2B marketplace.', region: 'Saudi' },
    { name: 'Lean', careers_url: 'https://leantech.me/careers', notes: 'UAE. Fintech infrastructure API.', region: 'UAE' },
    { name: 'Telda', careers_url: 'https://telda.com/careers', notes: 'Egypt. Neobank.', region: 'Egypt' },
    { name: 'Paymob', careers_url: 'https://paymob.com/careers', notes: 'Egypt. Payment infrastructure.', region: 'Egypt' },
    { name: 'MaxAB', careers_url: 'https://maxab.io/careers', notes: 'Egypt. B2B e-commerce for retailers.', region: 'Egypt' },
    { name: 'Breadfast', careers_url: 'https://breadfast.com/careers', notes: 'Egypt. Grocery delivery.', region: 'Egypt' },
    { name: 'Halan', careers_url: 'https://halan.com/careers', notes: 'Egypt. Super app, fintech, delivery.', region: 'Egypt' },
    { name: 'MNT-Halan', careers_url: 'https://mnt-halan.com/careers', notes: 'Egypt. Fintech super app.', region: 'Egypt' },
    { name: 'Rabbit', careers_url: 'https://rabbitmobility.com/careers', notes: 'Egypt. E-scooter sharing.', region: 'Egypt' },
  ],
  
  startups: [
    { name: 'Vercel', careers_url: 'https://vercel.com/careers', notes: 'Frontend cloud, Next.js' },
    { name: 'Supabase', careers_url: 'https://supabase.com/careers', notes: 'Open source Firebase alternative' },
    { name: 'Railway', careers_url: 'https://railway.app/careers', notes: 'Infrastructure platform' },
    { name: 'Render', careers_url: 'https://render.com/careers', notes: 'Cloud application hosting' },
    { name: 'Fly.io', careers_url: 'https://fly.io/jobs', notes: 'Global application platform' },
    { name: 'PlanetScale', careers_url: 'https://planetscale.com/careers', notes: 'MySQL platform' },
    { name: 'Temporal', careers_url: 'https://temporal.io/careers', notes: 'Durable execution' },
    { name: 'Figma', careers_url: 'https://www.figma.com/careers', notes: 'Design and collaboration' },
    { name: 'Linear', careers_url: 'https://linear.app/careers', notes: 'Issue tracking' },
    { name: 'Notion', careers_url: 'https://www.notion.so/careers', notes: 'Workspace and docs' },
    { name: 'Loom', careers_url: 'https://www.loom.com/careers', notes: 'Async video messaging' },
    { name: 'Stripe', careers_url: 'https://stripe.com/jobs', notes: 'Payments infrastructure' },
    { name: 'Twilio', careers_url: 'https://www.twilio.com/company/jobs', notes: 'Communications API' },
    { name: 'SendGrid', careers_url: 'https://sendgrid.com/careers', notes: 'Email delivery' },
    { name: 'Postman', careers_url: 'https://www.postman.com/careers', notes: 'API development' },
    { name: 'Retool', careers_url: 'https://retool.com/careers', notes: 'Internal tools builder' },
    { name: 'Bubble', careers_url: 'https://bubble.io/careers', notes: 'No-code platform' },
    { name: 'Webflow', careers_url: 'https://webflow.com/careers', notes: 'No-code website builder' },
    { name: 'Framer', careers_url: 'https://www.framer.com/careers', notes: 'Design and prototyping' },
    { name: 'Wiz', careers_url: 'https://www.wiz.io/careers', notes: 'Cloud security' },
    { name: 'Datadog', careers_url: 'https://careers.datadoghq.com', notes: 'Monitoring and security' },
    { name: 'Sentry', careers_url: 'https://sentry.io/careers', notes: 'Error tracking' },
    { name: 'LaunchDarkly', careers_url: 'https://launchdarkly.com/careers', notes: 'Feature management' },
    { name: 'HashiCorp', careers_url: 'https://www.hashicorp.com/careers', notes: 'Infrastructure automation' },
    { name: 'Confluent', careers_url: 'https://www.confluent.io/careers', notes: 'Data streaming' },
    { name: 'ClickHouse', careers_url: 'https://clickhouse.com/careers', notes: 'Analytics database' },
    { name: 'Starburst', careers_url: 'https://www.starburst.io/careers', notes: 'Data mesh' },
    { name: 'dbt Labs', careers_url: 'https://www.getdbt.com/careers', notes: 'Data transformation' },
    { name: 'Fivetran', careers_url: 'https://fivetran.com/careers', notes: 'Data integration' },
    { name: 'Airbyte', careers_url: 'https://airbyte.com/careers', notes: 'Open source data integration' },
    { name: 'Prefect', careers_url: 'https://www.prefect.io/careers', notes: 'Workflow orchestration' },
    { name: 'Dagster', careers_url: 'https://dagster.io/careers', notes: 'Data orchestration' },
    { name: 'Great Expectations', careers_url: 'https://greatexpectations.io/careers', notes: 'Data quality' },
    { name: 'Monte Carlo', careers_url: 'https://www.montecarlodata.com/careers', notes: 'Data observability' },
    { name: 'Metabase', careers_url: 'https://www.metabase.com/careers', notes: 'Business intelligence' },
    { name: 'Cube', careers_url: 'https://cube.dev/careers', notes: 'Analytics API' },
    { name: 'Deepnote', careers_url: 'https://deepnote.com/careers', notes: 'Collaborative notebooks' },
    { name: 'Hex', careers_url: 'https://hex.tech/careers', notes: 'Data science platform' },
    { name: 'Streamlit', careers_url: 'https://streamlit.io/careers', notes: 'Python apps' },
    { name: 'Gradio', careers_url: 'https://gradio.app/careers', notes: 'ML model demos' },
  ],
  
  remote: [
    { name: 'GitLab', careers_url: 'https://about.gitlab.com/jobs', notes: '100% remote, DevOps platform' },
    { name: 'Automattic', careers_url: 'https://automattic.com/work-with-us', notes: '100% remote, WordPress' },
    { name: 'Zapier', careers_url: 'https://zapier.com/jobs', notes: '100% remote, automation' },
    { name: 'Buffer', careers_url: 'https://buffer.com/journey', notes: '100% remote, social media' },
    { name: 'Doist', careers_url: 'https://doist.com/careers', notes: '100% remote, Todoist' },
    { name: 'Toggl', careers_url: 'https://toggl.com/jobs', notes: '100% remote, time tracking' },
    { name: 'Toptal', careers_url: 'https://www.toptal.com/careers', notes: 'Remote freelance network' },
    { name: 'Gun.io', careers_url: 'https://www.gun.io/careers', notes: 'Remote freelance' },
    { name: 'Auth0', careers_url: 'https://auth0.com/careers', notes: 'Remote-first, identity' },
    { name: 'MongoDB', careers_url: 'https://www.mongodb.com/careers', notes: 'Remote-friendly, database' },
    { name: 'Elastic', careers_url: 'https://www.elastic.co/careers', notes: 'Distributed, search' },
    { name: 'InfluxData', careers_url: 'https://www.influxdata.com/careers', notes: 'Remote-first, time series' },
    { name: 'GitHub', careers_url: 'https://github.com/about/careers', notes: 'Remote-friendly' },
    { name: 'Shopify', careers_url: 'https://www.shopify.com/careers', notes: 'Digital by default' },
    { name: 'Dropbox', careers_url: 'https://www.dropbox.com/jobs', notes: 'Virtual first' },
    { name: 'Coinbase', careers_url: 'https://www.coinbase.com/careers', notes: 'Remote-first, crypto' },
    { name: 'Block', careers_url: 'https://block.xyz/careers', notes: 'Remote-friendly, fintech' },
    { name: 'Plaid', careers_url: 'https://plaid.com/careers', notes: 'Remote-friendly, fintech' },
    { name: 'Brex', careers_url: 'https://www.brex.com/careers', notes: 'Remote-friendly, fintech' },
    { name: 'Mercury', careers_url: 'https://mercury.com/careers', notes: 'Remote-friendly, banking' },
    { name: 'AngelList', careers_url: 'https://angel.co/company/angellist', notes: 'Remote, startup platform' },
    { name: 'Y Combinator', careers_url: 'https://www.ycombinator.com/careers', notes: 'Accelerator' },
    { name: 'Techstars', careers_url: 'https://www.techstars.com/careers', notes: 'Accelerator' },
    { name: '500 Global', careers_url: 'https://500.co/careers', notes: 'Venture capital' },
    { name: 'Sequoia', careers_url: 'https://www.sequoiacap.com/join', notes: 'VC, portfolio companies' },
    { name: 'a16z', careers_url: 'https://a16z.com/careers', notes: 'VC, portfolio companies' },
    { name: 'Bessemer', careers_url: 'https://www.bvp.com/careers', notes: 'VC' },
    { name: 'Accel', careers_url: 'https://www.accel.com/people', notes: 'VC' },
    { name: 'Index Ventures', careers_url: 'https://www.indexventures.com/careers', notes: 'VC' },
    { name: 'Atomico', careers_url: 'https://www.atomico.com/careers', notes: 'European VC' },
  ],
  
  international: [
    { name: 'Spotify', careers_url: 'https://www.lifeatspotify.com/jobs', notes: 'Sweden, music streaming' },
    { name: 'Klarna', careers_url: 'https://www.klarna.com/careers', notes: 'Sweden, fintech' },
    { name: 'King', careers_url: 'https://www.king.com/careers', notes: 'Sweden, gaming (Candy Crush)' },
    { name: 'Mojang', careers_url: 'https://www.minecraft.net/en-us/mojang-careers', notes: 'Sweden, Minecraft' },
    { name: 'IKEA', careers_url: 'https://www.ikea.com/global/en/join-us/work-at-ikea/', notes: 'Sweden, retail tech' },
    { name: 'Ericsson', careers_url: 'https://www.ericsson.com/en/careers', notes: 'Sweden, telecom' },
    { name: 'SAP', careers_url: 'https://jobs.sap.com', notes: 'Germany, enterprise software' },
    { name: 'Siemens', careers_url: 'https://jobs.siemens.com', notes: 'Germany, industrial tech' },
    { name: 'BMW', careers_url: 'https://www.bmwgroup.jobs', notes: 'Germany, automotive tech' },
    { name: 'Mercedes-Benz', careers_url: 'https://group.mercedes-benz.com/careers', notes: 'Germany' },
    { name: 'Volkswagen', careers_url: 'https://karriere.volkswagen.de', notes: 'Germany' },
    { name: 'Adidas', careers_url: 'https://www.adidas-group.com/en/careers', notes: 'Germany' },
    { name: 'Zalando', careers_url: 'https://jobs.zalando.com', notes: 'Germany, e-commerce' },
    { name: 'Delivery Hero', careers_url: 'https://www.deliveryhero.com/careers', notes: 'Germany, food delivery' },
    { name: 'N26', careers_url: 'https://n26.com/en/careers', notes: 'Germany, neobank' },
    { name: 'Trade Republic', careers_url: 'https://traderepublic.com/careers', notes: 'Germany, trading' },
    { name: 'Checkout.com', careers_url: 'https://www.checkout.com/careers', notes: 'UK, fintech' },
    { name: 'Revolut', careers_url: 'https://www.revolut.com/careers', notes: 'UK, fintech' },
    { name: 'Monzo', careers_url: 'https://monzo.com/careers', notes: 'UK, neobank' },
    { name: 'Starling Bank', careers_url: 'https://www.starlingbank.com/careers', notes: 'UK' },
    { name: 'Wise', careers_url: 'https://wise.jobs', notes: 'UK, transfers' },
    { name: 'TransferGo', careers_url: 'https://www.transfergo.com/en/careers', notes: 'UK' },
    { name: 'GoCardless', careers_url: 'https://gocardless.com/careers', notes: 'UK, payments' },
    { name: 'SumUp', careers_url: 'https://sumup.com/careers', notes: 'UK, fintech' },
    { name: 'Rapyd', careers_url: 'https://www.rapyd.net/careers', notes: 'UK, fintech' },
    { name: 'Truelayer', careers_url: 'https://truelayer.com/careers', notes: 'UK, open banking' },
    { name: 'Thought Machine', careers_url: 'https://www.thoughtmachine.net/careers', notes: 'UK, banking tech' },
    { name: 'Babylon Health', careers_url: 'https://www.babylonhealth.com/careers', notes: 'UK, health tech' },
    { name: 'DeepMind', careers_url: 'https://deepmind.google/careers', notes: 'UK, AI' },
    { name: 'ARM', careers_url: 'https://www.arm.com/careers', notes: 'UK, semiconductor' },
    { name: 'Improbable', careers_url: 'https://www.improbable.io/careers', notes: 'UK, simulation' },
    { name: 'Deliveroo', careers_url: 'https://careers.deliveroo.co.uk', notes: 'UK, delivery' },
    { name: 'ASOS', careers_url: 'https://jobs.asos.com', notes: 'UK, fashion tech' },
    { name: 'Farfetch', careers_url: 'https://www.farfetch.com/careers', notes: 'Portugal/UK, luxury' },
    { name: 'Sage', careers_url: 'https://www.sage.com/en-gb/company/careers', notes: 'UK, accounting' },
    { name: 'Skyscanner', careers_url: 'https://www.skyscanner.net/jobs', notes: 'UK/Scotland, travel' },
    { name: 'Darktrace', careers_url: 'https://darktrace.com/careers', notes: 'UK, cybersecurity AI' },
    { name: 'Graphcore', careers_url: 'https://www.graphcore.ai/careers', notes: 'UK, AI chips' },
  ]
};

program
  .name('add-companies')
  .description('Bulk add companies to portals.yml with AI-powered search')
  .argument('[category]', 'Category to add (gulf, startups, remote, international, all, ai-search)')
  .option('-f, --file <path>', 'Portals file path', 'portals.yml')
  .option('-l, --list', 'List available categories')
  .option('--ai-search', 'Use AI to discover companies matching your CV')
  .option('-m, --model <model>', 'LLM model for AI search', 'openrouter/auto')
  .action(async (category, options) => {
    try {
      logger.section('🏢 Smart Company Adder');
      
      // Initialize variables
      let companiesToAdd = [];
      let cv = '';
      let targetRoles = [];
      try {
        const config = loadConfig();
        cv = loadCV();
        targetRoles = config.profile?.target_roles?.primary || [];
        logger.success('Loaded CV and profile for smart matching');
      } catch (e) {
        logger.warning('Could not load CV, proceeding without smart matching');
      }
      
      if (options.list) {
        console.log('\n📦 Available company packs:\n');
        Object.entries(COMPANY_PACKS).forEach(([key, companies]) => {
          console.log(`  ${key.padEnd(15)} ${companies.length} companies`);
        });
        console.log('  all            '.padEnd(15) + `${Object.values(COMPANY_PACKS).flat().length} companies\n`);
        return;
      }
      
      // Interactive mode if no category
      if (!category) {
        const { selectedCategory } = await inquirer.prompt([{
          type: 'list',
          name: 'selectedCategory',
          message: 'Which category to add?',
          choices: [
            { name: `🤖 AI Search (Discover companies matching your CV)`, value: 'ai-search' },
            { name: `🌴 Gulf/MENA (${COMPANY_PACKS.gulf.length} companies)`, value: 'gulf' },
            { name: `🚀 Startups (${COMPANY_PACKS.startups.length} companies)`, value: 'startups' },
            { name: `🏠 Remote-friendly (${COMPANY_PACKS.remote.length} companies)`, value: 'remote' },
            { name: `🌍 International (${COMPANY_PACKS.international.length} companies)`, value: 'international' },
            { name: `⭐ All categories (${Object.values(COMPANY_PACKS).flat().length} companies)`, value: 'all' }
          ]
        }]);
        category = selectedCategory;
      }
      
      // Handle AI search mode
      if (category === 'ai-search' || options.aiSearch) {
        if (!cv) {
          logger.error('CV not found. Please ensure cv.md exists to use AI search.');
          process.exit(1);
        }
        
        const config = loadConfig();
        const llm = new LLMClient(config.apiKey, options.model || config.model, config.provider);
        
        // Select regions for AI search
        const { aiRegions } = await inquirer.prompt([{
          type: 'checkbox',
          name: 'aiRegions',
          message: 'Select regions/countries for AI search:',
          choices: [
            { name: '🇦🇪 UAE/Dubai', value: 'UAE', checked: true },
            { name: '🇸🇦 Saudi Arabia', value: 'Saudi', checked: true },
            { name: '🇪🇬 Egypt', value: 'Egypt', checked: true },
            { name: '🇩🇪 Germany', value: 'Germany', checked: false },
            { name: '🇬🇧 UK', value: 'UK', checked: false },
            { name: '🇸🇪 Sweden', value: 'Sweden', checked: false },
            { name: '🇳🇱 Netherlands', value: 'Netherlands', checked: false },
            { name: '🇺🇸 USA', value: 'USA', checked: false },
            { name: '🌐 Remote/Global', value: 'Remote', checked: true }
          ]
        }]);
        
        if (aiRegions.length === 0) {
          logger.error('Please select at least one region for AI search.');
          process.exit(1);
        }
        
        logger.info(`🔍 AI searching for companies in: ${aiRegions.join(', ')}`);
        logger.info('Analyzing your CV to find matching companies...');
        
        // Build AI prompt
        const prompt = buildAISearchPrompt(cv, targetRoles, aiRegions);
        
        try {
          const result = await llm.chat(prompt, {
            maxTokens: 4000,
            temperature: 0.7
          });
          
          // Parse AI response to extract companies
          const discoveredCompanies = parseAICompanies(result);
          
          if (discoveredCompanies.length === 0) {
            logger.warning('No companies discovered by AI. Try adjusting your CV or regions.');
            return;
          }
          
          logger.success(`AI discovered ${discoveredCompanies.length} companies!`);
          
          // Show discovered companies
          console.log('\n📋 Discovered Companies:');
          discoveredCompanies.forEach((c, i) => {
            console.log(`  ${i + 1}. ${c.name} (${c.region})`);
            console.log(`     ${c.notes}`);
          });
          
          // Confirm adding
          const { confirmAdd } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmAdd',
            message: `Add these ${discoveredCompanies.length} companies to portals.yml?`,
            default: true
          }]);
          
          if (!confirmAdd) {
            logger.info('Cancelled. No companies added.');
            return;
          }
          
          // Set companiesToAdd to discovered companies
          companiesToAdd = discoveredCompanies;
          
          // Skip to adding companies directly (no second region selection)
          await addCompaniesToPortals(companiesToAdd, options.file);
          return;
          
        } catch (error) {
          logger.error(`AI search failed: ${error.message}`);
          logger.info('Falling back to predefined company packs...');
          category = 'all';
        }
      }
      
      // Select regions/countries (only for non-AI search modes)
      let { selectedRegions } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'selectedRegions',
        message: 'Select regions/countries to include (select all to include everything):',
        choices: [
          { name: '🇦🇪 UAE/Dubai', value: 'UAE', checked: true },
          { name: '🇸🇦 Saudi Arabia', value: 'Saudi', checked: true },
          { name: '🇪🇬 Egypt', value: 'Egypt', checked: true },
          { name: '🇪🇺 Europe (Germany, UK, Sweden...)', value: 'Europe', checked: false },
          { name: '🇺🇸 USA', value: 'USA', checked: false },
          { name: '🌐 Remote/Global', value: 'Remote', checked: true },
          { name: '🇸🇬 Asia Pacific', value: 'APAC', checked: false }
        ]
      }]);
      
      if (selectedRegions.length === 0) {
        logger.warning('No regions selected, using all regions');
        selectedRegions = ['all'];
      }
      
      // Validate category
      const validCategories = Object.keys(COMPANY_PACKS);
      if (category !== 'all' && !validCategories.includes(category)) {
        logger.error(`Invalid category: ${category}`);
        logger.info(`Valid categories: ${validCategories.join(', ')}, all`);
        process.exit(1);
      }
      
      // Get companies to add (if not set by AI search)
      if (companiesToAdd.length === 0) {
        companiesToAdd = category === 'all' 
          ? Object.values(COMPANY_PACKS).flat()
          : COMPANY_PACKS[category];
      }
      
      // Filter by selected regions
      if (!selectedRegions.includes('all')) {
        companiesToAdd = companiesToAdd.filter(company => {
          const companyRegion = company.region || '';
          // Check if company region matches any selected region
          return selectedRegions.some(region => 
            companyRegion.toLowerCase().includes(region.toLowerCase()) ||
            (region === 'Europe' && /Sweden|Germany|UK|France|Netherlands|Spain|Italy/i.test(companyRegion)) ||
            (region === 'Remote' && /remote|global/i.test(companyRegion + ' ' + company.notes))
          );
        });
        logger.info(`Filtered to ${companiesToAdd.length} companies in selected regions: ${selectedRegions.join(', ')}`);
      }
      
      // Smart matching: filter by CV keywords if CV loaded
      if (cv && companiesToAdd.length > 0) {
        const cvKeywords = extractKeywords(cv + ' ' + targetRoles.join(' '));
        const scoredCompanies = companiesToAdd.map(company => ({
          ...company,
          score: calculateMatchScore(company, cvKeywords)
        }));
        
        // Sort by score and take top matches
        scoredCompanies.sort((a, b) => b.score - a.score);
        
        // Show match scores
        logger.info('\n📊 Company match scores:');
        scoredCompanies.slice(0, 10).forEach(c => {
          const bar = '█'.repeat(Math.round(c.score / 10)) + '░'.repeat(10 - Math.round(c.score / 10));
          console.log(`  ${c.name.padEnd(20)} ${bar} ${c.score}%`);
        });
        
        // Filter to good matches only (score > 30)
        const goodMatches = scoredCompanies.filter(c => c.score >= 30);
        if (goodMatches.length > 0) {
          companiesToAdd = goodMatches;
          logger.success(`${goodMatches.length} companies match your CV profile`);
        } else {
          logger.warning('No strong matches found, using top 10 companies');
          companiesToAdd = scoredCompanies.slice(0, 10);
        }
      }
      
      logger.info(`Adding ${companiesToAdd.length} companies...`);
      
      // Load portals.yml
      const portalsPath = join(process.cwd(), options.file);
      let portalsContent = '';
      
      if (existsSync(portalsPath)) {
        portalsContent = readFileSync(portalsPath, 'utf-8');
        logger.success(`Loaded ${options.file}`);
      } else {
        // Create from template
        const templatePath = join(process.cwd(), 'templates', 'portals.example.yml');
        if (existsSync(templatePath)) {
          portalsContent = readFileSync(templatePath, 'utf-8');
          logger.success('Created from template');
        } else {
          logger.error('No portals.yml or template found');
          process.exit(1);
        }
      }
      
      // Find existing companies (case-insensitive)
      const existingCompanies = [];
      const companyNameRegex = /^  - name: (.+)$/gm;
      let match;
      while ((match = companyNameRegex.exec(portalsContent)) !== null) {
        existingCompanies.push(match[1].trim().toLowerCase());
      }
      
      // Filter out duplicates (case-insensitive comparison)
      const newCompanies = companiesToAdd.filter(c => !existingCompanies.includes(c.name.toLowerCase()));
      const duplicates = companiesToAdd.filter(c => existingCompanies.includes(c.name.toLowerCase()));
      
      if (duplicates.length > 0) {
        logger.warning(`${duplicates.length} companies already exist (skipped): ${duplicates.map(d => d.name).join(', ')}`);
      }
      
      if (newCompanies.length === 0) {
        logger.success('All companies already exist!');
        return;
      }
      
      // Build YAML for new companies
      const newCompaniesYaml = newCompanies.map(company => `
  - name: ${company.name}
    careers_url: ${company.careers_url}
    scan_method: websearch
    scan_query: 'site:${new URL(company.careers_url).hostname} careers'
    notes: "${company.notes}"${company.region ? `\n    region: "${company.region}"` : ''}
    enabled: true`).join('');
      
      // Insert before end of tracked_companies section
      const insertPosition = portalsContent.lastIndexOf('\n  - name:');
      if (insertPosition === -1) {
        // Find tracked_companies header
        const tcMatch = portalsContent.match(/tracked_companies:\n/);
        if (tcMatch) {
          const insertAfter = tcMatch.index + tcMatch[0].length;
          portalsContent = portalsContent.slice(0, insertAfter) + newCompaniesYaml + portalsContent.slice(insertAfter);
        }
      } else {
        // Find end of last company entry
        const lastCompanyEnd = portalsContent.indexOf('\n\n', insertPosition);
        if (lastCompanyEnd !== -1) {
          portalsContent = portalsContent.slice(0, lastCompanyEnd) + newCompaniesYaml + portalsContent.slice(lastCompanyEnd);
        } else {
          portalsContent += newCompaniesYaml;
        }
      }
      
      // Save
      writeFileSync(portalsPath, portalsContent, 'utf-8');
      
      logger.success(`Added ${newCompanies.length} new companies to ${options.file}`);
      logger.info('\nNew companies:');
      newCompanies.forEach(c => console.log(`  ✅ ${c.name}${c.region ? ` (${c.region})` : ''}`));
      
      logger.divider();
      logger.info(`Total tracked companies: ${existingCompanies.length + newCompanies.length}`);
      logger.info('\nNext steps:');
      logger.info('1. Review portals.yml');
      logger.info('2. Run: npx career-ops scan');
      
    } catch (error) {
      logger.error(`Failed to add companies: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();

// Helper functions for smart matching
function extractKeywords(text) {
  // Extract technical keywords from CV text
  const techKeywords = [
    'react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt', 'frontend', 'backend',
    'fullstack', 'node', 'python', 'go', 'rust', 'typescript', 'javascript',
    'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'terraform', 'ci/cd',
    'postgresql', 'mongodb', 'redis', 'elasticsearch', 'graphql', 'rest',
    'machine learning', 'ai', 'data', 'analytics', 'product', 'design',
    'mobile', 'ios', 'android', 'flutter', 'react native', 'swift',
    'fintech', 'e-commerce', 'saas', 'b2b', 'b2c', 'enterprise',
    'senior', 'lead', 'staff', 'principal', 'manager', 'director',
    'remote', 'hybrid', 'onsite', 'dubai', 'riyadh', 'cairo', 'berlin', 'london'
  ];
  
  const found = [];
  const lowerText = text.toLowerCase();
  
  techKeywords.forEach(keyword => {
    if (lowerText.includes(keyword.toLowerCase())) {
      found.push(keyword);
    }
  });
  
  return found;
}

function calculateMatchScore(company, cvKeywords) {
  if (!cvKeywords.length) return 50;
  const companyText = (company.name + ' ' + company.notes + ' ' + (company.region || '')).toLowerCase();
  let matches = 0;
  cvKeywords.forEach(keyword => {
    if (companyText.includes(keyword.toLowerCase())) matches++;
  });
  return Math.min(100, Math.round((matches / Math.min(cvKeywords.length, 10)) * 100));
}

async function addCompaniesToPortals(companiesToAdd, file) {
  const portalsPath = join(process.cwd(), file);
  let portalsContent = '';
  if (existsSync(portalsPath)) {
    portalsContent = readFileSync(portalsPath, 'utf-8');
  } else {
    const templatePath = join(process.cwd(), 'templates', 'portals.example.yml');
    if (existsSync(templatePath)) {
      portalsContent = readFileSync(templatePath, 'utf-8');
    } else {
      throw new Error('No portals.yml or template found');
    }
  }
  const existingCompanies = [];
  const companyNameRegex = /^  - name: (.+)$/gm;
  let match;
  while ((match = companyNameRegex.exec(portalsContent)) !== null) {
    existingCompanies.push(match[1].trim().toLowerCase());
  }
  const newCompanies = companiesToAdd.filter(c => !existingCompanies.includes(c.name.toLowerCase()));
  if (newCompanies.length === 0) {
    logger.success('All companies already exist!');
    return;
  }
  const newCompaniesYaml = newCompanies.map(company => `
  - name: ${company.name}
    careers_url: ${company.careers_url}
    scan_method: websearch
    scan_query: 'site:${new URL(company.careers_url).hostname} careers'
    notes: "${company.notes}"${company.region ? `\n    region: "${company.region}"` : ''}
    enabled: true`).join('');
  const insertPosition = portalsContent.lastIndexOf('\n  - name:');
  if (insertPosition === -1) {
    const tcMatch = portalsContent.match(/tracked_companies:\n/);
    if (tcMatch) {
      const insertAfter = tcMatch.index + tcMatch[0].length;
      portalsContent = portalsContent.slice(0, insertAfter) + newCompaniesYaml + portalsContent.slice(insertAfter);
    }
  } else {
    const lastCompanyEnd = portalsContent.indexOf('\n\n', insertPosition);
    if (lastCompanyEnd !== -1) {
      portalsContent = portalsContent.slice(0, lastCompanyEnd) + newCompaniesYaml + portalsContent.slice(lastCompanyEnd);
    } else {
      portalsContent += newCompaniesYaml;
    }
  }
  writeFileSync(portalsPath, portalsContent, 'utf-8');
  logger.success(`Added ${newCompanies.length} new companies to ${file}`);
  newCompanies.forEach(c => console.log(`  ✅ ${c.name}${c.region ? ` (${c.region})` : ''}`));
}

// AI Search helper functions
function buildAISearchPrompt(cv, targetRoles, regions) {
  return `
You are a career research assistant helping find companies that match a candidate's profile.

# CANDIDATE CV
${cv.substring(0, 2000)}

# TARGET ROLES
${targetRoles.join(', ') || 'Not specified'}

# REGIONS TO SEARCH
${regions.join(', ')}

# TASK
Find 10-15 companies in the specified regions that:
1. Match the candidate's skills and experience
2. Have active hiring for tech roles
3. Are reputable companies with good work culture
4. Have clear career growth opportunities

For each company, provide:
- Company name
- Careers page URL (must be real)
- Brief description (what they do, tech stack if known)
- Region/country
- Why they match the candidate

FORMAT YOUR RESPONSE AS JSON:
[
  {
    "name": "Company Name",
    "careers_url": "https://company.com/careers",
    "notes": "Brief description and why they match",
    "region": "Country/Region"
  }
]

ONLY return valid JSON. No markdown, no extra text.`;
}

function parseAICompanies(result) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const companies = JSON.parse(jsonMatch[0]);
      return companies.map(c => ({
        name: c.name,
        careers_url: c.careers_url,
        notes: c.notes,
        region: c.region
      })).filter(c => c.name && c.careers_url);
    }
  } catch (e) {
    logger.warning('Failed to parse AI response as JSON, trying manual extraction...');
  }
  
  // Fallback: try to extract company info manually
  const companies = [];
  const lines = result.split('\n');
  let currentCompany = null;
  
  for (const line of lines) {
    if (line.match(/^\d+\.\s+/) || line.match(/^-\s+/)) {
      // New company entry
      if (currentCompany && currentCompany.name) {
        companies.push(currentCompany);
      }
      const nameMatch = line.match(/(?:^\d+\.\s*|^-\s*)(.+?)(?:\s*[-:]\s*|\s+https)/);
      currentCompany = {
        name: nameMatch ? nameMatch[1].trim() : '',
        careers_url: '',
        notes: '',
        region: ''
      };
    } else if (line.includes('http') && currentCompany) {
      const urlMatch = line.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        currentCompany.careers_url = urlMatch[0];
      }
    } else if (currentCompany && line.trim() && !line.includes('{') && !line.includes('}')) {
      currentCompany.notes += line.trim() + ' ';
    }
  }
  
  if (currentCompany && currentCompany.name) {
    companies.push(currentCompany);
  }
  
  return companies.filter(c => c.name && c.careers_url);
}
