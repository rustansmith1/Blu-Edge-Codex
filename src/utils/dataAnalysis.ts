import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface NumericalData {
  value: number;
  context: string;
  documentTitle: string;
  metadata?: any;
}

interface Entity {
  entity: string;
  type: string;
  context: string;
  documentTitle: string;
  metadata?: any;
}

interface AnalysisResult {
  type: string;
  description: string;
  data: any;
  methodology: string;
}

/**
 * Calculate average values grouped by a specific entity type
 * For example, calculate average council tax increases grouped by political party
 */
export const calculateAverageByGroup = (
  numericalData: NumericalData[],
  entities: Entity[],
  groupByType: string
): AnalysisResult => {
  // Group entities by their names to avoid duplicates
  const groupedEntities = entities
    .filter(entity => entity.type === groupByType)
    .reduce((acc, entity) => {
      const key = entity.entity.toLowerCase();
      if (!acc[key]) {
        acc[key] = {
          name: entity.entity,
          documentTitles: [entity.documentTitle],
          contexts: [entity.context]
        };
      } else {
        if (!acc[key].documentTitles.includes(entity.documentTitle)) {
          acc[key].documentTitles.push(entity.documentTitle);
        }
        acc[key].contexts.push(entity.context);
      }
      return acc;
    }, {} as Record<string, { name: string; documentTitles: string[]; contexts: string[] }>);

  // Calculate averages for each group
  const results: Record<string, { values: number[]; average: number; count: number }> = {};

  // Initialize results for each group
  Object.keys(groupedEntities).forEach(key => {
    results[key] = { values: [], average: 0, count: 0 };
  });

  // Assign numerical data to groups based on context matching
  numericalData.forEach(data => {
    Object.keys(groupedEntities).forEach(key => {
      const entity = groupedEntities[key];
      
      // Check if this numerical data belongs to this entity
      const belongsToEntity = entity.contexts.some(context => 
        data.context.toLowerCase().includes(key) || 
        context.toLowerCase().includes(data.context.toLowerCase())
      );

      if (belongsToEntity) {
        results[key].values.push(data.value);
        results[key].count++;
      }
    });
  });

  // Calculate averages
  Object.keys(results).forEach(key => {
    const values = results[key].values;
    if (values.length > 0) {
      results[key].average = values.reduce((sum, val) => sum + val, 0) / values.length;
    }
  });

  return {
    type: 'average_by_group',
    description: `Average values grouped by ${groupByType}`,
    data: Object.keys(results).map(key => ({
      group: groupedEntities[key].name,
      average: results[key].average,
      count: results[key].count,
      values: results[key].values
    })),
    methodology: `Calculated by matching numerical values with ${groupByType} entities based on context proximity.`
  };
};

/**
 * Analyze council tax data specifically
 */
export const analyzeCouncilTaxData = async (
  numericalData: NumericalData[],
  entities: Entity[]
): Promise<AnalysisResult[]> => {
  const results: AnalysisResult[] = [];

  // Extract political parties with special handling for Conservative and Labour
  const politicalParties = entities.filter(e => e.type === 'political_party');
  const conservativeEntities = entities.filter(e => 
    e.type === 'political_party' && 
    (e.entity.toLowerCase() === 'conservative' || e.entity.toLowerCase() === 'tory')
  );
  const labourEntities = entities.filter(e => 
    e.type === 'political_party' && 
    e.entity.toLowerCase() === 'labour'
  );
  
  // Extract local authorities
  const localAuthorities = entities.filter(e => e.type === 'local_authority');

  // Extract council tax specific numerical data
  const councilTaxData = numericalData.filter(data => 
    data.context.toLowerCase().includes('council tax') ||
    data.context.toLowerCase().includes('band d') ||
    data.context.toLowerCase().includes('% increase') ||
    data.context.toLowerCase().includes('tax rate')
  );

  // Extract percentage increases specifically
  const percentageIncreases = numericalData.filter(data => 
    data.context.toLowerCase().includes('%') &&
    (data.context.toLowerCase().includes('increase') ||
     data.context.toLowerCase().includes('rise') ||
     data.context.toLowerCase().includes('change'))
  );

  // Calculate average by political party
  if (politicalParties.length > 0 && councilTaxData.length > 0) {
    const averageByParty = calculateAverageByGroup(
      councilTaxData,
      entities,
      'political_party'
    );
    results.push(averageByParty);
  }
  
  // Direct comparison between Conservative and Labour
  if (conservativeEntities.length > 0 && labourEntities.length > 0 && percentageIncreases.length > 0) {
    // Match percentage increases with Conservative councils
    const conservativeIncreases = percentageIncreases.filter(data => {
      return conservativeEntities.some(entity => 
        data.context.toLowerCase().includes(entity.entity.toLowerCase()) ||
        entity.context.toLowerCase().includes(data.context.toLowerCase()) ||
        // Check if the same document contains both Conservative control and this percentage
        entity.documentTitle === data.documentTitle
      );
    });
    
    // Match percentage increases with Labour councils
    const labourIncreases = percentageIncreases.filter(data => {
      return labourEntities.some(entity => 
        data.context.toLowerCase().includes(entity.entity.toLowerCase()) ||
        entity.context.toLowerCase().includes(data.context.toLowerCase()) ||
        // Check if the same document contains both Labour control and this percentage
        entity.documentTitle === data.documentTitle
      );
    });
    
    if (conservativeIncreases.length > 0 && labourIncreases.length > 0) {
      const comparison = compareGroups(
        'Conservative', 
        conservativeIncreases.map(d => d.value),
        'Labour', 
        labourIncreases.map(d => d.value)
      );
      
      // Add more detailed methodology
      comparison.methodology = `Compared council tax percentage increases between Conservative-controlled councils (${conservativeIncreases.length} data points) and Labour-controlled councils (${labourIncreases.length} data points). Data was matched by finding percentage values in the same context or document as political control information.`;
      
      results.push(comparison);
    }
  }

  // Calculate average by local authority type
  if (localAuthorities.length > 0) {
    // Extract authority types (e.g., District, Borough, etc.)
    const authorityTypes = localAuthorities.map(la => {
      const match = la.entity.match(/(District|Borough|County|City|Metropolitan|Unitary|Authority)$/);
      return match ? { 
        entity: match[0], 
        type: 'authority_type',
        context: la.context,
        documentTitle: la.documentTitle
      } : null;
    }).filter(Boolean) as Entity[];

    if (authorityTypes.length > 0) {
      const averageByType = calculateAverageByGroup(
        numericalData,
        authorityTypes,
        'authority_type'
      );
      results.push(averageByType);
    }
  }

  // Identify outliers in the data
  const percentageValues = numericalData
    .filter(data => data.context.includes('%'))
    .map(data => data.value);
  
  if (percentageValues.length > 0) {
    const mean = percentageValues.reduce((sum, val) => sum + val, 0) / percentageValues.length;
    const variance = percentageValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / percentageValues.length;
    const stdDev = Math.sqrt(variance);
    
    const outliers = numericalData
      .filter(data => data.context.includes('%') && Math.abs(data.value - mean) > 2 * stdDev)
      .map(data => ({
        value: data.value,
        documentTitle: data.documentTitle,
        context: data.context,
        deviationFromMean: data.value - mean
      }));
    
    results.push({
      type: 'outlier_analysis',
      description: 'Outliers in percentage values',
      data: {
        mean,
        stdDev,
        outliers
      },
      methodology: 'Identified using standard deviation method (values > 2 standard deviations from mean)'
    });
  }

  return results;
};

/**
 * Compare two groups (e.g., Labour vs Conservative)
 */
export const compareGroups = (
  group1Name: string,
  group1Data: number[],
  group2Name: string,
  group2Data: number[]
): AnalysisResult => {
  const group1Avg = group1Data.length > 0 
    ? group1Data.reduce((sum, val) => sum + val, 0) / group1Data.length 
    : 0;
  
  const group2Avg = group2Data.length > 0 
    ? group2Data.reduce((sum, val) => sum + val, 0) / group2Data.length 
    : 0;
  
  const difference = group1Avg - group2Avg;
  const percentageDifference = group2Avg !== 0 
    ? (difference / group2Avg) * 100 
    : 0;
  
  return {
    type: 'group_comparison',
    description: `Comparison between ${group1Name} and ${group2Name}`,
    data: {
      [group1Name]: {
        average: group1Avg,
        count: group1Data.length,
        values: group1Data
      },
      [group2Name]: {
        average: group2Avg,
        count: group2Data.length,
        values: group2Data
      },
      difference,
      percentageDifference,
      higherGroup: difference > 0 ? group1Name : group2Name,
      statisticallySignificant: Math.abs(difference) > 1 && group1Data.length >= 3 && group2Data.length >= 3
    },
    methodology: `Direct comparison of average values between ${group1Name} (${group1Data.length} samples) and ${group2Name} (${group2Data.length} samples).`
  };
};

/**
 * Extract and analyze data from documents
 */
export const extractAndAnalyzeData = async (documents: any[]): Promise<any> => {
  // Extract numerical data and entities from documents
  const numericalData: NumericalData[] = [];
  const entities: Entity[] = [];
  
  for (const doc of documents) {
    // Extract percentages and numbers
    const percentageRegex = /(\d+(?:\.\d+)?)\s*%/g;
    let match;
    
    while ((match = percentageRegex.exec(doc.content)) !== null) {
      const value = parseFloat(match[1]);
      const startIndex = Math.max(0, match.index - 100);
      const endIndex = Math.min(doc.content.length, match.index + match[0].length + 100);
      const context = doc.content.substring(startIndex, endIndex);
      
      numericalData.push({
        value,
        context,
        documentTitle: doc.title || 'Unknown Document'
      });
    }
    
    // Extract political parties
    const parties = ['Labour', 'Conservative', 'Liberal Democrat', 'Green', 'Independent'];
    
    parties.forEach(party => {
      const regex = new RegExp(`\\b${party}\\b`, 'gi');
      let partyMatch;
      
      while ((partyMatch = regex.exec(doc.content)) !== null) {
        const startIndex = Math.max(0, partyMatch.index - 100);
        const endIndex = Math.min(doc.content.length, partyMatch.index + partyMatch[0].length + 100);
        const context = doc.content.substring(startIndex, endIndex);
        
        entities.push({
          entity: partyMatch[0],
          type: 'political_party',
          context,
          documentTitle: doc.title || 'Unknown Document'
        });
      }
    });
  }
  
  // Perform analysis
  let results: AnalysisResult[] = [];
  
  // Check if we have council tax related data
  const isCouncilTaxData = numericalData.some(data => 
    data.context.toLowerCase().includes('council tax') ||
    data.context.toLowerCase().includes('tax increase')
  );
  
  if (isCouncilTaxData) {
    const councilTaxAnalysis = await analyzeCouncilTaxData(numericalData, entities);
    results = [...results, ...councilTaxAnalysis];
    
    // Compare Labour vs Conservative if both are present
    const labourData = entities
      .filter(e => e.entity.toLowerCase() === 'labour')
      .flatMap(e => {
        return numericalData
          .filter(data => data.context.includes('%') && 
            (data.context.toLowerCase().includes(e.entity.toLowerCase()) || 
             e.context.toLowerCase().includes(data.context.toLowerCase())))
          .map(data => data.value);
      });
    
    const conservativeData = entities
      .filter(e => e.entity.toLowerCase() === 'conservative')
      .flatMap(e => {
        return numericalData
          .filter(data => data.context.includes('%') && 
            (data.context.toLowerCase().includes(e.entity.toLowerCase()) || 
             e.context.toLowerCase().includes(data.context.toLowerCase())))
          .map(data => data.value);
      });
    
    if (labourData.length > 0 && conservativeData.length > 0) {
      const comparison = compareGroups('Labour', labourData, 'Conservative', conservativeData);
      results.push(comparison);
    }
  }
  
  return results;
};
