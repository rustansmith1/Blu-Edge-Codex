import { PrismaClient } from '@prisma/client';
import { Document } from 'langchain/document';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { analyzeCouncilTaxData, generateCouncilTaxReport, analyzeCouncilTaxDataWithFallback } from './councilTaxAnalysis';

const prisma = new PrismaClient();

// Analysis types supported by the engine
export enum AnalysisType {
  COUNCIL_TAX = 'council_tax',
  BUDGET_COMPARISON = 'budget_comparison',
  SPENDING_ANALYSIS = 'spending_analysis',
  DEMOGRAPHIC_ANALYSIS = 'demographic_analysis',
  ELECTION_RESULTS = 'election_results',
  GENERAL = 'general'
}

// Interface for analysis results
export interface AnalysisResult {
  type: AnalysisType;
  title: string;
  summary: string;
  markdownReport: string;
  data: any;
}

/**
 * Detect the type of analysis needed based on the query
 */
export const detectAnalysisType = (query: string): AnalysisType => {
  const lowerQuery = query.toLowerCase();
  
  // Council tax analysis
  if ((lowerQuery.includes('council tax') || lowerQuery.includes('tax rate')) &&
      (lowerQuery.includes('labour') || lowerQuery.includes('conservative') || 
       lowerQuery.includes('party') || lowerQuery.includes('political'))) {
    return AnalysisType.COUNCIL_TAX;
  }
  
  // Budget comparison
  if ((lowerQuery.includes('budget') || lowerQuery.includes('spending')) &&
      (lowerQuery.includes('compare') || lowerQuery.includes('comparison') || 
       lowerQuery.includes('difference'))) {
    return AnalysisType.BUDGET_COMPARISON;
  }
  
  // Spending analysis
  if (lowerQuery.includes('spend') || lowerQuery.includes('expenditure') || 
      lowerQuery.includes('cost') || lowerQuery.includes('funding')) {
    return AnalysisType.SPENDING_ANALYSIS;
  }
  
  // Demographic analysis
  if (lowerQuery.includes('demographic') || lowerQuery.includes('population') || 
      lowerQuery.includes('age group') || lowerQuery.includes('ethnicity')) {
    return AnalysisType.DEMOGRAPHIC_ANALYSIS;
  }
  
  // Election results
  if (lowerQuery.includes('election') || lowerQuery.includes('vote') || 
      lowerQuery.includes('ballot') || lowerQuery.includes('won') || 
      lowerQuery.includes('majority')) {
    return AnalysisType.ELECTION_RESULTS;
  }
  
  // Default to general analysis
  return AnalysisType.GENERAL;
};

/**
 * Extract numerical data from text using LangChain
 */
export const extractNumericalData = async (text: string): Promise<{ value: number, context: string }[]> => {
  // Split text into smaller chunks for processing
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  
  const chunks = await splitter.splitText(text);
  const results: { value: number, context: string }[] = [];
  
  // Process each chunk
  for (const chunk of chunks) {
    // Extract percentages
    const percentageRegex = /(\\d+(?:\\.\\d+)?)\\s*%/g;
    let match;
    while ((match = percentageRegex.exec(chunk)) !== null) {
      const value = parseFloat(match[1]);
      const startIndex = Math.max(0, match.index - 100);
      const endIndex = Math.min(chunk.length, match.index + match[0].length + 100);
      const context = chunk.substring(startIndex, endIndex);
      
      results.push({ value, context });
    }
    
    // Extract currency values
    const currencyRegex = /[£$€](\\d+(?:,\\d+)*(?:\\.\\d+)?)/g;
    while ((match = currencyRegex.exec(chunk)) !== null) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      const startIndex = Math.max(0, match.index - 100);
      const endIndex = Math.min(chunk.length, match.index + match[0].length + 100);
      const context = chunk.substring(startIndex, endIndex);
      
      results.push({ value, context });
    }
    
    // Extract plain numbers in relevant contexts
    const numberContexts = [
      'total', 'amount', 'sum', 'average', 'mean', 'median', 'increase', 'decrease',
      'budget', 'spending', 'expenditure', 'funding', 'allocation', 'cost'
    ];
    
    for (const contextWord of numberContexts) {
      if (chunk.toLowerCase().includes(contextWord)) {
        const numberRegex = new RegExp(`${contextWord}\\s+(?:of|:)?\\s*(\\d+(?:,\\d+)*(?:\\.\\d+)?)`, 'gi');
        while ((match = numberRegex.exec(chunk)) !== null) {
          const value = parseFloat(match[1].replace(/,/g, ''));
          const startIndex = Math.max(0, match.index - 100);
          const endIndex = Math.min(chunk.length, match.index + match[0].length + 100);
          const context = chunk.substring(startIndex, endIndex);
          
          results.push({ value, context });
        }
      }
    }
  }
  
  return results;
};

/**
 * Extract entities (organizations, locations, people, etc.) from text
 */
export const extractEntities = (text: string): { entity: string, type: string, context: string }[] => {
  const results: { entity: string, type: string, context: string }[] = [];
  
  // Political parties
  const parties = [
    { name: 'Labour', type: 'political_party' },
    { name: 'Conservative', type: 'political_party' },
    { name: 'Liberal Democrat', type: 'political_party' },
    { name: 'Green', type: 'political_party' },
    { name: 'Reform UK', type: 'political_party' },
    { name: 'SNP', type: 'political_party' },
    { name: 'Plaid Cymru', type: 'political_party' }
  ];
  
  for (const party of parties) {
    const regex = new RegExp(`\\b${party.name}\\b`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      const startIndex = Math.max(0, match.index - 100);
      const endIndex = Math.min(text.length, match.index + match[0].length + 100);
      const context = text.substring(startIndex, endIndex);
      
      results.push({
        entity: party.name,
        type: party.type,
        context
      });
    }
  }
  
  // Local authorities
  const authorityRegex = /([A-Z][a-z]+(?: [A-Z][a-z]+)*) (?:Council|Borough|District|County|Authority)/g;
  let match;
  while ((match = authorityRegex.exec(text)) !== null) {
    const authority = match[1];
    const startIndex = Math.max(0, match.index - 100);
    const endIndex = Math.min(text.length, match.index + match[0].length + 100);
    const context = text.substring(startIndex, endIndex);
    
    results.push({
      entity: authority,
      type: 'local_authority',
      context
    });
  }
  
  // Government departments
  const departments = [
    'Department for Education',
    'Department of Health',
    'Home Office',
    'Treasury',
    'Ministry of Defence',
    'Department for Transport',
    'Department for Work and Pensions'
  ];
  
  for (const dept of departments) {
    const regex = new RegExp(`\\b${dept}\\b`, 'gi');
    while ((match = regex.exec(text)) !== null) {
      const startIndex = Math.max(0, match.index - 100);
      const endIndex = Math.min(text.length, match.index + match[0].length + 100);
      const context = text.substring(startIndex, endIndex);
      
      results.push({
        entity: dept,
        type: 'government_department',
        context
      });
    }
  }
  
  return results;
};

/**
 * Generate a markdown table from data
 */
export const generateMarkdownTable = (
  headers: string[],
  rows: any[][],
  alignments: ('left' | 'center' | 'right')[] = []
): string => {
  if (rows.length === 0) return '';
  
  // Generate header row
  let table = '| ' + headers.join(' | ') + ' |\n';
  
  // Generate alignment row
  table += '|';
  for (let i = 0; i < headers.length; i++) {
    const align = alignments[i] || 'left';
    if (align === 'left') table += ' :--- |';
    else if (align === 'center') table += ' :---: |';
    else if (align === 'right') table += ' ---: |';
    else table += ' --- |';
  }
  table += '\n';
  
  // Generate data rows
  for (const row of rows) {
    table += '| ' + row.map(cell => String(cell)).join(' | ') + ' |\n';
  }
  
  return table;
};

/**
 * Format numbers for display
 */
export const formatNumber = (num: number, options: { 
  decimals?: number, 
  prefix?: string, 
  suffix?: string,
  useCommas?: boolean
} = {}): string => {
  const { 
    decimals = 2, 
    prefix = '', 
    suffix = '',
    useCommas = true
  } = options;
  
  let formatted = num.toFixed(decimals);
  
  if (useCommas) {
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
    formatted = parts.join('.');
  }
  
  return `${prefix}${formatted}${suffix}`;
};

/**
 * Perform budget comparison analysis
 */
export const analyzeBudgetData = async (documents: any[]): Promise<AnalysisResult> => {
  // Extract budget data from documents
  const budgetData: {
    department: string,
    year: string,
    amount: number,
    changePercent?: number
  }[] = [];
  
  // Process each document
  for (const doc of documents) {
    const content = doc.content || '';
    
    // Extract department budget lines
    const budgetRegex = /([A-Za-z ]+) (?:budget|allocation|funding|spending)(?:[:\\s]+)(?:£|\\$|€)?(\\d+(?:,\\d+)*(?:\\.\\d+)?)(?: ?[mb]illion)?/gi;
    let match;
    
    while ((match = budgetRegex.exec(content)) !== null) {
      const department = match[1].trim();
      let amount = parseFloat(match[2].replace(/,/g, ''));
      
      // Adjust for millions/billions
      if (match[0].toLowerCase().includes('billion')) {
        amount *= 1000000000;
      } else if (match[0].toLowerCase().includes('million')) {
        amount *= 1000000;
      }
      
      // Try to extract year
      const yearRegex = /(20\\d{2})(?:\\s*[-\\/]\\s*(?:20)?(\\d{2}))?/;
      const yearMatch = content.substr(Math.max(0, match.index - 50), 100).match(yearRegex);
      const year = yearMatch ? yearMatch[1] + (yearMatch[2] ? `-${yearMatch[2]}` : '') : 'Unknown';
      
      // Try to extract change percentage
      const changeRegex = /(\\+|-)?(\\d+(?:\\.\\d+)?)%\\s+(?:increase|decrease|change)/i;
      const changeMatch = content.substr(match.index, 200).match(changeRegex);
      const changePercent = changeMatch 
        ? parseFloat(changeMatch[2]) * (changeMatch[1] === '-' ? -1 : 1)
        : undefined;
      
      budgetData.push({
        department,
        year,
        amount,
        changePercent
      });
    }
  }
  
  // Group by department and year
  const groupedData: Record<string, Record<string, { amount: number, changePercent?: number }>> = {};
  
  for (const item of budgetData) {
    if (!groupedData[item.department]) {
      groupedData[item.department] = {};
    }
    
    groupedData[item.department][item.year] = {
      amount: item.amount,
      changePercent: item.changePercent
    };
  }
  
  // Generate markdown report
  let markdownReport = '## Budget Comparison Analysis\n\n';
  
  // Add summary
  markdownReport += '### Summary\n\n';
  markdownReport += `This analysis compares budget allocations across ${Object.keys(groupedData).length} departments.\n\n`;
  
  // Add methodology
  markdownReport += '### Methodology\n\n';
  markdownReport += 'This analysis was performed by:\n\n';
  markdownReport += '1. Extracting budget figures from the provided documents\n';
  markdownReport += '2. Grouping budget data by department and fiscal year\n';
  markdownReport += '3. Calculating changes between fiscal years where data is available\n';
  markdownReport += '4. Identifying departments with the largest increases and decreases\n\n';
  
  // Add data table
  markdownReport += '### Budget Data by Department\n\n';
  
  // Create table headers based on available years
  const years = Array.from(new Set(budgetData.map(item => item.year))).sort();
  const headers = ['Department', ...years];
  
  // Create table rows
  const rows = Object.entries(groupedData).map(([department, yearData]) => {
    const row = [department];
    
    for (const year of years) {
      if (yearData[year]) {
        const { amount, changePercent } = yearData[year];
        const formattedAmount = formatNumber(amount, { prefix: '£', useCommas: true });
        const changeText = changePercent !== undefined 
          ? ` (${changePercent >= 0 ? '+' : ''}${changePercent}%)`
          : '';
        
        row.push(`${formattedAmount}${changeText}`);
      } else {
        row.push('N/A');
      }
    }
    
    return row;
  });
  
  markdownReport += generateMarkdownTable(headers, rows);
  
  // Add year-on-year comparison if multiple years
  if (years.length > 1) {
    markdownReport += '\n\n### Year-on-Year Changes\n\n';
    
    // Calculate average change
    const departmentsWithChange = Object.values(groupedData).filter(yearData => {
      return years.some(year => yearData[year]?.changePercent !== undefined);
    });
    
    const avgChange = departmentsWithChange.length > 0
      ? departmentsWithChange.reduce((sum, yearData) => {
          const changes = Object.values(yearData)
            .filter(data => data.changePercent !== undefined)
            .map(data => data.changePercent as number);
          
          return sum + (changes.length > 0 
            ? changes.reduce((s, c) => s + c, 0) / changes.length
            : 0);
        }, 0) / departmentsWithChange.length
      : 0;
    
    markdownReport += `Average budget change across all departments: **${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%**\n\n`;
    
    // List departments with largest increases and decreases
    const departmentsWithAvgChange = Object.entries(groupedData)
      .map(([department, yearData]) => {
        const changes = Object.values(yearData)
          .filter(data => data.changePercent !== undefined)
          .map(data => data.changePercent as number);
        
        const avgDeptChange = changes.length > 0
          ? changes.reduce((sum, change) => sum + change, 0) / changes.length
          : 0;
        
        return { department, avgChange: avgDeptChange };
      })
      .filter(item => !isNaN(item.avgChange))
      .sort((a, b) => b.avgChange - a.avgChange);
    
    if (departmentsWithAvgChange.length > 0) {
      // Top increases
      markdownReport += '#### Largest Budget Increases:\n\n';
      departmentsWithAvgChange
        .filter(item => item.avgChange > 0)
        .slice(0, 5)
        .forEach(item => {
          markdownReport += `- **${item.department}**: +${item.avgChange.toFixed(2)}%\n`;
        });
      
      // Top decreases
      markdownReport += '\n#### Largest Budget Decreases:\n\n';
      departmentsWithAvgChange
        .filter(item => item.avgChange < 0)
        .slice(0, 5)
        .forEach(item => {
          markdownReport += `- **${item.department}**: ${item.avgChange.toFixed(2)}%\n`;
        });
    }
  }
  
  // Add conclusion
  markdownReport += '\n\n### Conclusion\n\n';
  markdownReport += 'Based on the available data, ';
  
  // Calculate average change for conclusion
  let avgBudgetChange = 0;
  if (years.length > 1) {
    const departmentsWithChange = Object.values(groupedData).filter(yearData => {
      return years.some(year => yearData[year]?.changePercent !== undefined);
    });
    
    avgBudgetChange = departmentsWithChange.length > 0
      ? departmentsWithChange.reduce((sum, yearData) => {
          const changes = Object.values(yearData)
            .filter(data => data.changePercent !== undefined)
            .map(data => data.changePercent as number);
          
          return sum + (changes.length > 0 
            ? changes.reduce((s, c) => s + c, 0) / changes.length
            : 0);
        }, 0) / departmentsWithChange.length
      : 0;
      
    markdownReport += `budgets have ${avgBudgetChange >= 0 ? 'increased' : 'decreased'} by an average of ${Math.abs(avgBudgetChange).toFixed(2)}% `;
    markdownReport += `across departments between ${years[0]} and ${years[years.length - 1]}. `;
  }
  
  markdownReport += 'The analysis shows variations in budget allocations across different departments, ';
  markdownReport += 'reflecting changing priorities and funding needs.';
  
  return {
    type: AnalysisType.BUDGET_COMPARISON,
    title: 'Budget Comparison Analysis',
    summary: `Analysis of budget allocations across ${Object.keys(groupedData).length} departments${years.length > 1 ? ` for fiscal years ${years.join(', ')}` : ''}.`,
    markdownReport,
    data: {
      departments: Object.keys(groupedData),
      years,
      budgetData: groupedData
    }
  };
};

/**
 * Perform spending analysis
 */
export const analyzeSpendingData = async (documents: any[]): Promise<AnalysisResult> => {
  // Extract spending data from documents
  const spendingData: {
    category: string,
    amount: number,
    year: string,
    department?: string
  }[] = [];
  
  // Process each document
  for (const doc of documents) {
    const content = doc.content || '';
    
    // Extract spending categories
    const spendingRegex = /(?:spent|spending|expenditure|cost)(?:\\s+of)?(?:\\s+on)?\\s+([A-Za-z ]+)(?:[:\\s]+)(?:£|\\$|€)?(\\d+(?:,\\d+)*(?:\\.\\d+)?)(?: ?[mb]illion)?/gi;
    let match;
    
    while ((match = spendingRegex.exec(content)) !== null) {
      const category = match[1].trim();
      let amount = parseFloat(match[2].replace(/,/g, ''));
      
      // Adjust for millions/billions
      if (match[0].toLowerCase().includes('billion')) {
        amount *= 1000000000;
      } else if (match[0].toLowerCase().includes('million')) {
        amount *= 1000000;
      }
      
      // Try to extract year
      const yearRegex = /(20\\d{2})(?:\\s*[-\\/]\\s*(?:20)?(\\d{2}))?/;
      const yearMatch = content.substr(Math.max(0, match.index - 50), 100).match(yearRegex);
      const year = yearMatch ? yearMatch[1] + (yearMatch[2] ? `-${yearMatch[2]}` : '') : 'Unknown';
      
      // Try to extract department
      const deptRegex = /([A-Za-z ]+) (?:Department|Ministry|Office)/i;
      const deptMatch = content.substr(Math.max(0, match.index - 100), 150).match(deptRegex);
      const department = deptMatch ? deptMatch[1].trim() : undefined;
      
      spendingData.push({
        category,
        amount,
        year,
        department
      });
    }
  }
  
  // Group by category
  const groupedData: Record<string, { 
    totalAmount: number, 
    yearlyData: Record<string, number>,
    departments: Set<string>
  }> = {};
  
  for (const item of spendingData) {
    if (!groupedData[item.category]) {
      groupedData[item.category] = {
        totalAmount: 0,
        yearlyData: {},
        departments: new Set()
      };
    }
    
    groupedData[item.category].totalAmount += item.amount;
    
    if (!groupedData[item.category].yearlyData[item.year]) {
      groupedData[item.category].yearlyData[item.year] = 0;
    }
    groupedData[item.category].yearlyData[item.year] += item.amount;
    
    if (item.department) {
      groupedData[item.category].departments.add(item.department);
    }
  }
  
  // Generate markdown report
  let markdownReport = '## Spending Analysis\n\n';
  
  // Add summary
  markdownReport += '### Summary\n\n';
  markdownReport += `This analysis examines spending across ${Object.keys(groupedData).length} categories.\n\n`;
  
  // Add methodology
  markdownReport += '### Methodology\n\n';
  markdownReport += 'This analysis was performed by:\n\n';
  markdownReport += '1. Extracting spending figures from the provided documents\n';
  markdownReport += '2. Grouping spending data by category and fiscal year\n';
  markdownReport += '3. Calculating total spending for each category\n';
  markdownReport += '4. Identifying categories with the highest expenditure\n\n';
  
  // Add data table
  markdownReport += '### Spending by Category\n\n';
  
  // Sort categories by total amount
  const sortedCategories = Object.entries(groupedData)
    .sort((a, b) => b[1].totalAmount - a[1].totalAmount);
  
  const headers = ['Category', 'Total Spending', 'Departments'];
  const rows = sortedCategories.map(([category, data]) => [
    category,
    formatNumber(data.totalAmount, { prefix: '£', useCommas: true }),
    Array.from(data.departments).join(', ') || 'Unknown'
  ]);
  
  markdownReport += generateMarkdownTable(headers, rows);
  
  // Add yearly breakdown if available
  const years = Array.from(new Set(spendingData.map(item => item.year))).sort();
  
  if (years.length > 1 && years[0] !== 'Unknown') {
    markdownReport += '\n\n### Yearly Spending Breakdown\n\n';
    
    const yearlyHeaders = ['Category', ...years];
    const yearlyRows = sortedCategories.map(([category, data]) => {
      const row = [category];
      
      for (const year of years) {
        const amount = data.yearlyData[year] || 0;
        row.push(formatNumber(amount, { prefix: '£', useCommas: true }));
      }
      
      return row;
    });
    
    markdownReport += generateMarkdownTable(yearlyHeaders, yearlyRows);
    
    // Calculate year-on-year changes
    if (years.length > 1) {
      markdownReport += '\n\n### Year-on-Year Changes\n\n';
      
      // Calculate total spending per year
      const yearlyTotals: Record<string, number> = {};
      
      for (const year of years) {
        yearlyTotals[year] = sortedCategories.reduce((sum, [_, data]) => {
          return sum + (data.yearlyData[year] || 0);
        }, 0);
      }
      
      // Calculate percentage changes
      const changes: { year: string, change: number, changePercent: number }[] = [];
      
      for (let i = 1; i < years.length; i++) {
        const prevYear = years[i - 1];
        const currYear = years[i];
        
        if (yearlyTotals[prevYear] > 0) {
          const change = yearlyTotals[currYear] - yearlyTotals[prevYear];
          const changePercent = (change / yearlyTotals[prevYear]) * 100;
          
          changes.push({
            year: `${prevYear} to ${currYear}`,
            change,
            changePercent
          });
        }
      }
      
      if (changes.length > 0) {
        const changeHeaders = ['Period', 'Change', 'Percentage Change'];
        const changeRows = changes.map(change => [
          change.year,
          formatNumber(change.change, { prefix: '£', useCommas: true }),
          `${change.changePercent >= 0 ? '+' : ''}${change.changePercent.toFixed(2)}%`
        ]);
        
        markdownReport += generateMarkdownTable(changeHeaders, changeRows);
      }
    }
  }
  
  // Add top spending categories
  markdownReport += '\n\n### Top Spending Categories\n\n';
  
  sortedCategories.slice(0, 5).forEach(([category, data], index) => {
    markdownReport += `${index + 1}. **${category}**: ${formatNumber(data.totalAmount, { prefix: '£', useCommas: true })}\n`;
  });
  
  // Add conclusion
  markdownReport += '\n\n### Conclusion\n\n';
  markdownReport += 'Based on the available data, ';
  
  if (sortedCategories.length > 0) {
    markdownReport += `the highest spending category is **${sortedCategories[0][0]}** at ${formatNumber(sortedCategories[0][1].totalAmount, { prefix: '£', useCommas: true })}, `;
    markdownReport += `followed by **${sortedCategories[1]?.[0] || 'N/A'}** and **${sortedCategories[2]?.[0] || 'N/A'}**. `;
  }
  
  if (years.length > 1) {
    // Calculate year-on-year changes
    const yearlyChanges: { year: string, change: number, changePercent: number }[] = [];
    
    for (let i = 1; i < years.length; i++) {
      const prevYear = years[i - 1];
      const currYear = years[i];
      
      // Calculate total spending per year
      const prevYearTotal = sortedCategories.reduce((sum, [_, data]) => {
        return sum + (data.yearlyData[prevYear] || 0);
      }, 0);
      
      const currYearTotal = sortedCategories.reduce((sum, [_, data]) => {
        return sum + (data.yearlyData[currYear] || 0);
      }, 0);
      
      if (prevYearTotal > 0) {
        const change = currYearTotal - prevYearTotal;
        const changePercent = (change / prevYearTotal) * 100;
        
        yearlyChanges.push({
          year: `${prevYear} to ${currYear}`,
          change,
          changePercent
        });
      }
    }
    
    if (yearlyChanges.length > 0) {
      const avgChangePercent = yearlyChanges.reduce((sum, change) => sum + change.changePercent, 0) / yearlyChanges.length;
      markdownReport += `Overall spending has ${avgChangePercent >= 0 ? 'increased' : 'decreased'} by an average of ${Math.abs(avgChangePercent).toFixed(2)}% year-on-year. `;
    }
  }
  
  markdownReport += 'The analysis highlights the main areas of expenditure and how spending priorities have evolved over time.';
  
  return {
    type: AnalysisType.SPENDING_ANALYSIS,
    title: 'Spending Analysis',
    summary: `Analysis of spending across ${Object.keys(groupedData).length} categories${years.length > 1 ? ` for fiscal years ${years.join(', ')}` : ''}.`,
    markdownReport,
    data: {
      categories: Object.keys(groupedData),
      years,
      spendingData: groupedData
    }
  };
};

/**
 * Main function to perform data analysis based on query and documents
 */
export const performAnalysis = async (
  query: string,
  documents: any[]
): Promise<AnalysisResult> => {
  // Detect analysis type
  const analysisType = detectAnalysisType(query);
  
  // Perform appropriate analysis based on type
  switch (analysisType) {
    case AnalysisType.COUNCIL_TAX:
      // Use the specialized council tax analysis with sample data fallback
      const documentIds = documents.map(doc => doc.id).filter(Boolean);
      const councilTaxReport = await generateCouncilTaxReport(documentIds, true);
      
      return {
        type: AnalysisType.COUNCIL_TAX,
        title: 'Council Tax Analysis: Labour vs. Conservative',
        summary: 'Analysis of council tax increases by political party control.',
        markdownReport: councilTaxReport,
        data: await analyzeCouncilTaxDataWithFallback(documentIds, true)
      };
      
    case AnalysisType.BUDGET_COMPARISON:
      return await analyzeBudgetData(documents);
      
    case AnalysisType.SPENDING_ANALYSIS:
      return await analyzeSpendingData(documents);
      
    // Add more analysis types as needed
      
    default:
      // For general analysis, return a basic report
      return {
        type: AnalysisType.GENERAL,
        title: 'General Data Analysis',
        summary: 'Basic analysis of the provided documents.',
        markdownReport: '## General Data Analysis\n\nThis is a general analysis of the provided documents. For more specific analysis, please refine your query.',
        data: {}
      };
  }
};

/**
 * Generate a comprehensive analysis report based on query and search results
 */
export const generateAnalysisReport = async (
  query: string,
  searchResults: any[]
): Promise<string> => {
  try {
    // Convert search results to document format
    const documents = searchResults.map(result => ({
      id: result.metadata?.documentId,
      title: result.documentTitle,
      content: result.content,
      metadata: result.metadata
    }));
    
    // Perform analysis
    const analysis = await performAnalysis(query, documents);
    
    // Return markdown report
    return analysis.markdownReport;
  } catch (error) {
    console.error('Error generating analysis report:', error);
    return `## Analysis Error\n\nAn error occurred while analyzing the data: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
};
