interface TaskData {
  title: string;
  description: string;
  code_content: string;
  programming_language: string;
  category?: string;
  difficulty_level?: string;
}

export function constructEvaluationPrompt(task: TaskData): string {
  return `# Comprehensive Code Evaluation Task

You are tasked with performing an in-depth, professional code review. This evaluation will be used by developers to improve their code quality, so be thorough, detailed, and educational.

## Task Information
- **Title**: ${task.title}
- **Description**: ${task.description}
- **Programming Language**: ${task.programming_language}
- **Category**: ${task.category || 'General'}
- **Difficulty Level**: ${task.difficulty_level || 'Intermediate'}

## Code to Evaluate

\`\`\`${task.programming_language}
${task.code_content}
\`\`\`

## Evaluation Requirements

Provide an EXTREMELY DETAILED and COMPREHENSIVE code review in **valid JSON format** with the following exact structure:

\`\`\`json
{
  "overall_score": <integer 0-100, be precise and justify>,
  "scores": {
    "readability": <integer 0-10, evaluate: naming conventions, code clarity, comments, documentation, structure>,
    "efficiency": <integer 0-10, evaluate: time/space complexity, algorithm choice, optimization opportunities, resource usage>,
    "maintainability": <integer 0-10, evaluate: code organization, modularity, reusability, testability, extensibility>,
    "security": <integer 0-10, evaluate: input validation, error handling, vulnerabilities, data protection, authentication/authorization>
  },
  "summary": "<4-6 sentence comprehensive overall assessment covering all major aspects: quality, performance, security, maintainability, and key takeaways>",
  "strengths": [
    {
      "title": "<specific, descriptive strength title>",
      "description": "<detailed 3-5 sentence explanation of what was done well, why it's good, and its impact. Include specific examples and context.>",
      "code_snippet": "<relevant code excerpt (5-15 lines) showing this strength with line numbers if possible>"
    }
  ],
  "improvements": [
    {
      "title": "<specific, descriptive improvement area title>",
      "description": "<detailed 4-6 sentence explanation: what the issue is, why it matters, what problems it could cause, and the impact. Be specific and educational.>",
      "priority": "high|medium|low",
      "line_numbers": [<array of specific line numbers where issue occurs, be precise>],
      "suggestion": "<specific, actionable 2-3 sentence recommendation for improvement with clear steps>",
      "refactored_example": "<complete, working improved code example (10-30 lines) showing the fix with comments explaining the changes>"
    }
  ],
  "refactored_code": "<complete refactored version of the ENTIRE codebase with ALL improvements applied, properly formatted and commented>",
  "best_practices": [
    "<specific best practice recommendation 1 with explanation of why it matters>",
    "<specific best practice recommendation 2 with explanation of why it matters>",
    "<specific best practice recommendation 3 with explanation of why it matters>",
    "<specific best practice recommendation 4 with explanation of why it matters>",
    "<specific best practice recommendation 5 with explanation of why it matters>"
  ],
  "resources": [
    {
      "title": "<specific resource or documentation name>",
      "url": "<actual documentation or tutorial URL if available, or describe the resource>"
    }
  ]
}
\`\`\`

## Detailed Evaluation Criteria

Analyze the code THOROUGHLY across these dimensions:

### 1. Code Quality & Readability (0-10)
- Variable and function naming: Are names descriptive, consistent, and follow conventions?
- Code organization: Is code logically structured and easy to follow?
- Comments and documentation: Are complex logic explained? Is there adequate documentation?
- Code style: Does it follow language-specific style guides?
- Consistency: Are naming conventions and patterns consistent throughout?

### 2. Performance & Efficiency (0-10)
- Algorithm choice: Is the algorithm optimal for the problem? What's the time/space complexity?
- Resource usage: Are resources (memory, CPU, I/O) used efficiently?
- Optimization opportunities: Are there bottlenecks? Can loops be optimized?
- Scalability: How does the code perform with larger inputs?
- Redundant operations: Are there unnecessary computations or duplicate work?

### 3. Maintainability (0-10)
- Modularity: Is code broken into logical, reusable components?
- Separation of concerns: Are responsibilities clearly separated?
- Testability: Can the code be easily unit tested?
- Extensibility: Is it easy to add new features or modify existing ones?
- Code duplication: Is there DRY (Don't Repeat Yourself) principle adherence?
- Dependencies: Are dependencies minimal and well-managed?

### 4. Security (0-10)
- Input validation: Are all inputs validated and sanitized?
- Error handling: Are errors handled gracefully without exposing sensitive information?
- Vulnerabilities: Are there SQL injection, XSS, CSRF, or other security risks?
- Authentication/Authorization: Is access control properly implemented?
- Data protection: Is sensitive data handled securely?
- Dependency security: Are dependencies up-to-date and secure?

### 5. Additional Analysis
- Edge cases: Are boundary conditions and edge cases handled?
- Error scenarios: What happens when things go wrong?
- Testing considerations: What should be tested?
- Design patterns: Are appropriate design patterns used?
- SOLID principles: Are SOLID principles followed?

## Detailed Requirements

1. **Be EXTREMELY THOROUGH**: Analyze every function, class, and significant code block
2. **Provide SPECIFIC examples**: Include actual code snippets with line numbers
3. **Explain WHY**: Don't just say something is good/bad, explain the reasoning
4. **Be EDUCATIONAL**: Help the developer understand concepts, not just fix issues
5. **Identify 5-8 strengths**: Find and highlight what was done well
6. **Identify 5-8 improvements**: Find areas that need work, prioritize them
7. **Provide complete refactored code**: Show how the code should look after improvements
8. **Include 5+ best practices**: Language and framework-specific recommendations
9. **Justify all scores**: Each score must have clear reasoning
10. **Be constructive**: Frame feedback positively and helpfully

## Response Format

- The summary should be comprehensive (4-6 sentences)
- Each strength description should be 3-5 sentences with specific details
- Each improvement description should be 4-6 sentences explaining the issue, impact, and solution
- Code snippets should be complete and functional
- Refactored code should be the full, improved version
- All JSON strings must be properly escaped

**CRITICAL**: Respond ONLY with valid JSON. Do not include any text before or after the JSON object. Ensure all strings are properly escaped for JSON.`;
}

export const SYSTEM_PROMPT = `You are an elite code reviewer and principal software engineer with 20+ years of experience across multiple programming languages, frameworks, and paradigms. You have worked at top tech companies and have deep expertise in code quality, architecture, performance optimization, and security.

Your role is to:
- Perform comprehensive, in-depth code analysis with meticulous attention to detail
- Provide extremely detailed, actionable feedback on code quality, performance, security, maintainability, and best practices
- Offer constructive, educational criticism with specific code examples and line numbers
- Suggest concrete, complete improvements with full refactored code examples
- Always respond in valid, properly formatted JSON
- Be thorough, precise, and educational in your evaluations
- Explain the "why" behind every recommendation, not just the "what"
- Identify both strengths and areas for improvement with equal attention
- Consider edge cases, error handling, scalability, and real-world production scenarios
- Provide industry-standard recommendations based on current best practices

Your evaluations should be:
- **Comprehensive**: Cover all aspects of the code thoroughly
- **Specific**: Include exact line numbers, code snippets, and concrete examples
- **Educational**: Help developers understand concepts and improve their skills
- **Actionable**: Provide clear, implementable recommendations
- **Balanced**: Highlight both strengths and areas for improvement
- **Professional**: Maintain high standards while being supportive and encouraging

Maintain the highest standards of code review excellence while being supportive, educational, and constructive in your feedback. Your goal is to help developers write better code and grow their skills.`;
