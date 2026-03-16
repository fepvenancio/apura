using System.Text.Json;
using System.Text.Json.Serialization;
using ApuraConnector.Core.Models;

namespace ApuraConnector.Core.Serialization;

public static class MessageSerializer
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNameCaseInsensitive = true,
    };

    public static MessageEnvelope? Deserialize(string json)
        => JsonSerializer.Deserialize<MessageEnvelope>(json, Options);

    public static string Serialize(MessageEnvelope message)
        => JsonSerializer.Serialize(message, Options);

    public static T? DeserializePayload<T>(object? payload) where T : class
    {
        if (payload is JsonElement element)
            return element.Deserialize<T>(Options);
        return null;
    }

    public static MessageEnvelope CreateMessage(string id, string type, object? payload = null)
        => new()
        {
            V = 1,
            Id = id,
            Type = type,
            Ts = DateTime.UtcNow.ToString("O"),
            Payload = payload,
        };

    public static MessageEnvelope CreateErrorMessage(string requestId, string code, string message)
        => CreateMessage(requestId, "error", new ErrorPayload { Code = code, Message = message });

    public static MessageEnvelope CreateHealthPong(string requestId, HealthPongPayload health)
        => CreateMessage(requestId, "health.pong", health);

    public static MessageEnvelope CreateQueryResult(string requestId, QueryResultPayload result)
        => CreateMessage(requestId, "query.result", result);
}
