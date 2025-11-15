package com.selfservice.obd.core.protocol

import java.util.ArrayDeque
import java.util.Locale

/**
 * Lightweight evaluator for conversion formulas expressed with tokens A..H.
 */
internal object PidFormulaEvaluator {
    private val LETTERS = listOf('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')
    private val OPERATORS = setOf("+", "-", "*", "/")
    private val PRECEDENCE = mapOf("+" to 1, "-" to 1, "*" to 2, "/" to 2)

    fun evaluate(formula: String, payload: ByteArray): Double {
        val context = LETTERS.withIndex()
            .filter { (index, _) -> index < payload.size }
            .associate { (index, letter) -> letter to (payload[index].toInt() and 0xFF).toDouble() }
        val tokens = tokenize(formula)
        val rpn = toRpn(tokens)
        return evaluateRpn(rpn, context)
    }

    private fun tokenize(rawFormula: String): List<String> {
        val formula = rawFormula.replace(" ", "").uppercase(Locale.US)
        if (formula.isEmpty()) return emptyList()
        val tokens = mutableListOf<String>()
        var index = 0
        while (index < formula.length) {
            val char = formula[index]
            when {
                char in LETTERS -> {
                    tokens += char.toString()
                    index += 1
                }
                char.isDigit() || char == '.' -> {
                    val start = index
                    index += 1
                    while (index < formula.length && (formula[index].isDigit() || formula[index] == '.')) {
                        index += 1
                    }
                    tokens += formula.substring(start, index)
                }
                char == '-' && index + 1 < formula.length && (formula[index + 1].isDigit() || formula[index + 1] == '.') &&
                    (tokens.isEmpty() || tokens.last() in OPERATORS || tokens.last() == "(") -> {
                    val start = index
                    index += 1
                    while (index < formula.length && (formula[index].isDigit() || formula[index] == '.')) {
                        index += 1
                    }
                    tokens += formula.substring(start, index)
                }
                char == '(' || char == ')' -> {
                    tokens += char.toString()
                    index += 1
                }
                char in setOf('+', '-', '*', '/') -> {
                    tokens += char.toString()
                    index += 1
                }
                else -> throw IllegalArgumentException("Unsupported character '$char' in formula '$rawFormula'")
            }
        }
        return tokens
    }

    private fun toRpn(tokens: List<String>): List<String> {
        if (tokens.isEmpty()) return emptyList()
        val output = mutableListOf<String>()
        val operators = ArrayDeque<String>()
        for (token in tokens) {
            when {
                token in OPERATORS -> {
                    while (operators.isNotEmpty()) {
                        val head = operators.last()
                        if (head in OPERATORS && precedence(head) >= precedence(token)) {
                            output += operators.removeLast()
                        } else {
                            break
                        }
                    }
                    operators.addLast(token)
                }
                token == "(" -> operators.addLast(token)
                token == ")" -> {
                    while (operators.isNotEmpty() && operators.last() != "(") {
                        output += operators.removeLast()
                    }
                    if (operators.isEmpty() || operators.removeLast() != "(") {
                        throw IllegalArgumentException("Mismatched parentheses in formula")
                    }
                }
                else -> output += token
            }
        }
        while (operators.isNotEmpty()) {
            val op = operators.removeLast()
            if (op == "(" || op == ")") {
                throw IllegalArgumentException("Mismatched parentheses in formula")
            }
            output += op
        }
        return output
    }

    private fun evaluateRpn(tokens: List<String>, context: Map<Char, Double>): Double {
        if (tokens.isEmpty()) return 0.0
        val stack = ArrayDeque<Double>()
        for (token in tokens) {
            when {
                token in OPERATORS -> {
                    val right = if (stack.isEmpty()) {
                        throw IllegalArgumentException("Malformed expression")
                    } else {
                        stack.removeLast()
                    }
                    val left = if (stack.isEmpty()) {
                        throw IllegalArgumentException("Malformed expression")
                    } else {
                        stack.removeLast()
                    }
                    val result = when (token) {
                        "+" -> left + right
                        "-" -> left - right
                        "*" -> left * right
                        else -> left / right
                    }
                    stack.addLast(result)
                }
                token.length == 1 && token[0] in LETTERS -> {
                    val value = context[token[0]] ?: 0.0
                    stack.addLast(value)
                }
                else -> stack.addLast(token.toDouble())
            }
        }
        return stack.singleOrNull() ?: throw IllegalArgumentException("Malformed expression")
    }

    private fun precedence(operator: String): Int = PRECEDENCE[operator] ?: 0
}
